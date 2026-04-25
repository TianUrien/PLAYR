-- ============================================================================
-- Home Feed: denormalize author fields + add country / role filters
-- ============================================================================
--
-- HOCKIA's Home feed is currently global — every authenticated user sees the
-- same chronological stream. At ~200 onboarded users a follower-restricted
-- feed would be empty for almost everyone (Andrew Chen connection-density
-- argument: 100k users at 30 connections > 1M at 2). The strategic call is
-- to keep Home global by default and give users persistent country + role
-- filters to slice the firehose themselves.
--
-- This migration is the data-layer foundation for those filters:
--
--   1. Adds three denormalized columns to home_feed_items:
--      - author_profile_id : the profile the event is "about"
--      - author_role       : profiles.role at event time
--      - author_country_id : profiles.nationality_country_id at event time
--
--      Denormalized because home_feed_items.source_id is polymorphic
--      (vacancy, profile_reference, brand_post, ...) — joining to derive
--      author/role/country at query time would be expensive and ugly.
--
--   2. Backfills existing rows from metadata + source_type so the filters
--      work on historical content too.
--
--   3. Updates all 7 trigger functions so future events populate the columns
--      at insert time. Triggers stay idempotent; this is purely additive.
--
--   4. Replaces get_home_feed() with a version that accepts:
--      - p_country_ids INTEGER[]  (NULL = no filter)
--      - p_roles TEXT[]           (NULL = no filter)
--
--      Country filter intentionally PASSES THROUGH brand_post / brand_product
--      and the user_post equivalent (author_role = 'brand'). Brands are
--      universal in the field-hockey context — a Belgian player filtering to
--      "Argentina only" still wants to see brand content.
--
-- All changes are reversible: the columns and indexes can be dropped, and
-- the previous get_home_feed body (kept verbatim for rollback) is in
-- migration 202603130200_remove_member_joined_from_feed.sql.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. ADD DENORMALIZED AUTHOR COLUMNS
-- ============================================================================

ALTER TABLE public.home_feed_items
  ADD COLUMN IF NOT EXISTS author_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS author_role TEXT,
  ADD COLUMN IF NOT EXISTS author_country_id INTEGER REFERENCES public.countries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.home_feed_items.author_profile_id IS
  'Denormalized profile this feed event is about. Used for country / role filters in get_home_feed without polymorphic joins.';
COMMENT ON COLUMN public.home_feed_items.author_role IS
  'Denormalized profiles.role at event creation. Used for the Home role filter.';
COMMENT ON COLUMN public.home_feed_items.author_country_id IS
  'Denormalized profiles.nationality_country_id at event creation. NULL means the row is excluded by an active country filter (brands pass through via item_type, not via this column).';

-- ============================================================================
-- 2. INDEXES FOR FILTER QUERIES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_home_feed_items_author_role
  ON public.home_feed_items (author_role, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_home_feed_items_author_country
  ON public.home_feed_items (author_country_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. BACKFILL EXISTING ROWS
-- ============================================================================
-- Strategy: derive author_profile_id from source_type + metadata, then derive
-- role + country by joining to profiles.

-- 3a. Backfill author_profile_id
-- Wrapped in a `SELECT p.id FROM profiles WHERE p.id = (...)` subquery so
-- orphaned rows (events whose author profile was hard-deleted before the
-- FK existed) backfill to NULL instead of failing the FK. This matches
-- the column's `ON DELETE SET NULL` behavior for future deletes.
UPDATE public.home_feed_items hfi
SET author_profile_id = (
  SELECT p.id FROM public.profiles p WHERE p.id = (CASE
      -- Direct profile reference (member_joined, milestone_achieved with profile source)
      WHEN hfi.source_type = 'profile' THEN hfi.source_id
      -- Reference received: requester is the "author" (the one being endorsed)
      WHEN hfi.source_type = 'profile_reference' THEN
        NULLIF(hfi.metadata->>'profile_id', '')::UUID
      -- Vacancy / opportunity: the club is the author
      WHEN hfi.source_type = 'vacancy' THEN
        NULLIF(hfi.metadata->>'club_id', '')::UUID
      -- Milestones: profile_id is in metadata (source_id is a synthetic UUID)
      WHEN hfi.source_type = 'milestone' THEN
        NULLIF(hfi.metadata->>'profile_id', '')::UUID
      -- Brand posts / products: derive profile_id from brands table via brand_id
      WHEN hfi.source_type IN ('brand_post', 'brand_product') THEN
        (SELECT b.profile_id FROM public.brands b WHERE b.id = NULLIF(hfi.metadata->>'brand_id', '')::UUID)
      ELSE NULL
    END)
)
WHERE hfi.author_profile_id IS NULL;

-- 3b. Backfill author_role + author_country_id from the resolved profile
UPDATE public.home_feed_items hfi
SET
  author_role = p.role,
  author_country_id = p.nationality_country_id
FROM public.profiles p
WHERE hfi.author_profile_id = p.id
  AND (hfi.author_role IS NULL OR hfi.author_country_id IS NULL);

-- ============================================================================
-- 4. UPDATE TRIGGER FUNCTIONS TO POPULATE NEW COLUMNS
-- ============================================================================
-- Each trigger now writes author_profile_id / author_role / author_country_id
-- at insert time so future events are filterable without backfill.

-- 4a. MEMBER JOINED
CREATE OR REPLACE FUNCTION public.generate_member_joined_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.onboarding_completed = true
     AND (OLD.onboarding_completed IS NULL OR OLD.onboarding_completed = false)
     AND NEW.role IN ('player', 'coach', 'club') THEN

    INSERT INTO home_feed_items (
      item_type, source_id, source_type, is_test_account,
      author_profile_id, author_role, author_country_id,
      metadata
    )
    VALUES (
      'member_joined',
      NEW.id,
      'profile',
      COALESCE(NEW.is_test_account, false),
      NEW.id,
      NEW.role,
      NEW.nationality_country_id,
      jsonb_build_object(
        'profile_id', NEW.id,
        'full_name', NEW.full_name,
        'role', NEW.role,
        'avatar_url', NEW.avatar_url,
        'nationality_country_id', NEW.nationality_country_id,
        'base_location', NEW.base_location,
        'position', NEW.position,
        'current_club', NEW.current_club
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 4b. OPPORTUNITY POSTED
CREATE OR REPLACE FUNCTION public.generate_opportunity_posted_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_profile RECORD;
BEGIN
  IF NEW.status = 'open'
     AND (OLD.status IS NULL OR OLD.status::text != 'open') THEN

    SELECT p.id, p.full_name, p.avatar_url, p.is_test_account, p.role, p.nationality_country_id
    INTO v_club_profile
    FROM profiles p
    WHERE p.id = NEW.club_id;

    INSERT INTO home_feed_items (
      item_type, source_id, source_type, is_test_account,
      author_profile_id, author_role, author_country_id,
      metadata
    )
    VALUES (
      'opportunity_posted',
      NEW.id,
      'vacancy',
      COALESCE(v_club_profile.is_test_account, false),
      v_club_profile.id,
      v_club_profile.role,
      v_club_profile.nationality_country_id,
      jsonb_build_object(
        'vacancy_id', NEW.id,
        'title', NEW.title,
        'opportunity_type', NEW.opportunity_type,
        'position', NEW.position,
        'gender', NEW.gender,
        'location_city', NEW.location_city,
        'location_country', NEW.location_country,
        'club_id', NEW.club_id,
        'club_name', v_club_profile.full_name,
        'club_logo', v_club_profile.avatar_url,
        'priority', NEW.priority,
        'start_date', NEW.start_date
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 4c. REFERENCE RECEIVED
CREATE OR REPLACE FUNCTION public.generate_reference_received_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester_profile RECORD;
  v_referee_profile RECORD;
BEGIN
  IF NEW.status = 'accepted'
     AND (OLD.status IS NULL OR OLD.status::text != 'accepted') THEN

    SELECT id, full_name, avatar_url, role, is_test_account, nationality_country_id
    INTO v_requester_profile
    FROM profiles
    WHERE id = NEW.requester_id;

    SELECT id, full_name, avatar_url, role
    INTO v_referee_profile
    FROM profiles
    WHERE id = NEW.reference_id;

    INSERT INTO home_feed_items (
      item_type, source_id, source_type, is_test_account,
      author_profile_id, author_role, author_country_id,
      metadata
    )
    VALUES (
      'reference_received',
      NEW.id,
      'profile_reference',
      COALESCE(v_requester_profile.is_test_account, false),
      v_requester_profile.id,
      v_requester_profile.role,
      v_requester_profile.nationality_country_id,
      jsonb_build_object(
        'reference_record_id', NEW.id,
        'profile_id', NEW.requester_id,
        'full_name', v_requester_profile.full_name,
        'avatar_url', v_requester_profile.avatar_url,
        'role', v_requester_profile.role,
        'referee_id', NEW.reference_id,
        'referee_name', v_referee_profile.full_name,
        'referee_avatar', v_referee_profile.avatar_url,
        'referee_role', v_referee_profile.role,
        'relationship_type', NEW.relationship_type,
        'endorsement_text', NEW.endorsement_text
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 4d. BRAND POST PUBLISHED
CREATE OR REPLACE FUNCTION public.generate_brand_post_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  -- is_verified was unified onto profiles in 20260420235035 — read from p,
  -- not b (the column was dropped from brands).
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.deleted_at,
    p.id AS profile_id, p.role, p.nationality_country_id, p.is_test_account,
    COALESCE(p.is_verified, false) AS is_verified
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (
    item_type, source_id, source_type, is_test_account,
    author_profile_id, author_role, author_country_id,
    metadata
  )
  VALUES (
    'brand_post',
    NEW.id,
    'brand_post',
    COALESCE(v_brand.is_test_account, false),
    v_brand.profile_id,
    v_brand.role,
    v_brand.nationality_country_id,
    jsonb_build_object(
      'brand_id', v_brand.id,
      'brand_name', v_brand.name,
      'brand_slug', v_brand.slug,
      'brand_logo_url', v_brand.logo_url,
      'brand_category', v_brand.category,
      'brand_is_verified', v_brand.is_verified,
      'post_id', NEW.id,
      'post_content', NEW.content,
      'post_image_url', NEW.image_url
    )
  )
  ON CONFLICT (item_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4e. BRAND PRODUCT PUBLISHED
CREATE OR REPLACE FUNCTION public.generate_brand_product_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  -- is_verified was unified onto profiles in 20260420235035 — read from p,
  -- not b (the column was dropped from brands).
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.deleted_at,
    p.id AS profile_id, p.role, p.nationality_country_id, p.is_test_account,
    COALESCE(p.is_verified, false) AS is_verified
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (
    item_type, source_id, source_type, is_test_account,
    author_profile_id, author_role, author_country_id,
    metadata
  )
  VALUES (
    'brand_product',
    NEW.id,
    'brand_product',
    COALESCE(v_brand.is_test_account, false),
    v_brand.profile_id,
    v_brand.role,
    v_brand.nationality_country_id,
    jsonb_build_object(
      'brand_id', v_brand.id,
      'brand_name', v_brand.name,
      'brand_slug', v_brand.slug,
      'brand_logo_url', v_brand.logo_url,
      'brand_category', v_brand.category,
      'brand_is_verified', v_brand.is_verified,
      'product_id', NEW.id,
      'product_name', NEW.name,
      'product_description', NEW.description,
      'product_images', NEW.images,
      'product_external_url', NEW.external_url
    )
  )
  ON CONFLICT (item_type, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 4f. record_milestone helper — also accept author fields so callers populate them
-- (signature changes; old callers fail compilation. Update all in this migration.)
DROP FUNCTION IF EXISTS public.record_milestone(UUID, TEXT, BOOLEAN, JSONB);

CREATE OR REPLACE FUNCTION public.record_milestone(
  p_profile_id UUID,
  p_milestone_type TEXT,
  p_is_test_account BOOLEAN,
  p_metadata JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_exists BOOLEAN;
  v_profile RECORD;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profile_milestones
    WHERE profile_id = p_profile_id
      AND milestone_type = p_milestone_type
  ) INTO v_already_exists;

  IF v_already_exists THEN
    RETURN FALSE;
  END IF;

  -- Resolve author role + country from the profile so the new feed row is filterable
  SELECT role, nationality_country_id INTO v_profile
  FROM profiles
  WHERE id = p_profile_id;

  INSERT INTO profile_milestones (profile_id, milestone_type)
  VALUES (p_profile_id, p_milestone_type);

  INSERT INTO home_feed_items (
    item_type, source_id, source_type, is_test_account,
    author_profile_id, author_role, author_country_id,
    metadata
  )
  VALUES (
    'milestone_achieved',
    gen_random_uuid(),
    'milestone',
    COALESCE(p_is_test_account, false),
    p_profile_id,
    v_profile.role,
    v_profile.nationality_country_id,
    p_metadata || jsonb_build_object('milestone_type', p_milestone_type)
  );

  RETURN TRUE;
END;
$$;

-- ============================================================================
-- 5. REPLACE get_home_feed() WITH FILTER-AWARE VERSION
-- ============================================================================
-- New parameters:
--   p_country_ids INTEGER[]  NULL  ->  no country filter
--   p_roles       TEXT[]     NULL  ->  no role filter
-- Existing parameters (p_limit, p_offset, p_item_type) are preserved and
-- defaulted so all existing callers continue to work unchanged.
--
-- Country filter intentionally lets brand_post / brand_product (and any post
-- whose author_role = 'brand') pass through — brands are universal.

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_item_type TEXT DEFAULT NULL,
  p_country_ids INTEGER[] DEFAULT NULL,
  p_roles TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items JSONB;
  v_total BIGINT;
  v_user_id UUID := auth.uid();
  v_is_test BOOLEAN;
BEGIN
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- Default unified path (covers p_item_type IS NULL) — UNION of system + user posts
  IF p_item_type IS NULL OR p_item_type = '' THEN

    SELECT (
      (SELECT COUNT(*)
       FROM home_feed_items hfi
       WHERE hfi.deleted_at IS NULL
         AND hfi.item_type != 'member_joined'
         AND (v_is_test OR hfi.is_test_account = false)
         AND (
           p_roles IS NULL
           OR hfi.author_role = ANY(p_roles)
         )
         AND (
           p_country_ids IS NULL
           OR hfi.item_type IN ('brand_post', 'brand_product')
           OR hfi.author_role = 'brand'
           OR hfi.author_country_id = ANY(p_country_ids)
         )
      )
      +
      (SELECT COUNT(*)
       FROM user_posts up
       JOIN profiles p ON p.id = up.author_id
       WHERE up.deleted_at IS NULL
         AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
         AND (
           p_roles IS NULL
           OR p.role = ANY(p_roles)
         )
         AND (
           p_country_ids IS NULL
           OR p.role = 'brand'
           OR p.nationality_country_id = ANY(p_country_ids)
         )
      )
    ) INTO v_total;

    SELECT COALESCE(jsonb_agg(c.item_data ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT item_data, created_at FROM (
        SELECT
          hfi.created_at,
          hfi.metadata || jsonb_build_object(
            'feed_item_id', hfi.id,
            'item_type', hfi.item_type,
            'created_at', hfi.created_at
          ) AS item_data
        FROM home_feed_items hfi
        WHERE hfi.deleted_at IS NULL
          AND hfi.item_type != 'member_joined'
          AND (v_is_test OR hfi.is_test_account = false)
          AND (
            p_roles IS NULL
            OR hfi.author_role = ANY(p_roles)
          )
          AND (
            p_country_ids IS NULL
            OR hfi.item_type IN ('brand_post', 'brand_product')
            OR hfi.author_role = 'brand'
            OR hfi.author_country_id = ANY(p_country_ids)
          )

        UNION ALL

        SELECT
          up.created_at,
          jsonb_build_object(
            'feed_item_id', up.id,
            'item_type', 'user_post',
            'created_at', up.created_at,
            'post_id', up.id,
            'author_id', up.author_id,
            'author_name', COALESCE(b.name, p.full_name),
            'author_avatar', COALESCE(b.logo_url, p.avatar_url),
            'author_role', p.role,
            'content', up.content,
            'images', up.images,
            'like_count', up.like_count,
            'comment_count', up.comment_count,
            'has_liked', EXISTS (
              SELECT 1 FROM post_likes pl
              WHERE pl.post_id = up.id AND pl.user_id = v_user_id
            )
          ) AS item_data
        FROM user_posts up
        JOIN profiles p ON p.id = up.author_id
        LEFT JOIN brands b ON b.profile_id = p.id
        WHERE up.deleted_at IS NULL
          AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
          AND (
            p_roles IS NULL
            OR p.role = ANY(p_roles)
          )
          AND (
            p_country_ids IS NULL
            OR p.role = 'brand'
            OR p.nationality_country_id = ANY(p_country_ids)
          )
      ) unified
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) c;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- Specific system item type
  IF p_item_type != 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items hfi
    WHERE hfi.deleted_at IS NULL
      AND hfi.item_type = p_item_type
      AND hfi.item_type != 'member_joined'
      AND (v_is_test OR hfi.is_test_account = false)
      AND (p_roles IS NULL OR hfi.author_role = ANY(p_roles))
      AND (
        p_country_ids IS NULL
        OR hfi.item_type IN ('brand_post', 'brand_product')
        OR hfi.author_role = 'brand'
        OR hfi.author_country_id = ANY(p_country_ids)
      );

    SELECT COALESCE(jsonb_agg(
      hfi.metadata || jsonb_build_object(
        'feed_item_id', hfi.id,
        'item_type', hfi.item_type,
        'created_at', hfi.created_at
      )
      ORDER BY hfi.created_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT id, item_type, metadata, created_at
      FROM home_feed_items hfi2
      WHERE hfi2.deleted_at IS NULL
        AND hfi2.item_type = p_item_type
        AND hfi2.item_type != 'member_joined'
        AND (v_is_test OR hfi2.is_test_account = false)
        AND (p_roles IS NULL OR hfi2.author_role = ANY(p_roles))
        AND (
          p_country_ids IS NULL
          OR hfi2.item_type IN ('brand_post', 'brand_product')
          OR hfi2.author_role = 'brand'
          OR hfi2.author_country_id = ANY(p_country_ids)
        )
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) hfi;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- p_item_type = 'user_post'
  SELECT COUNT(*) INTO v_total
  FROM user_posts up
  JOIN profiles p ON p.id = up.author_id
  WHERE up.deleted_at IS NULL
    AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
    AND (p_roles IS NULL OR p.role = ANY(p_roles))
    AND (
      p_country_ids IS NULL
      OR p.role = 'brand'
      OR p.nationality_country_id = ANY(p_country_ids)
    );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'feed_item_id', up.id,
      'item_type', 'user_post',
      'created_at', up.created_at,
      'post_id', up.id,
      'author_id', up.author_id,
      'author_name', COALESCE(b.name, p.full_name),
      'author_avatar', COALESCE(b.logo_url, p.avatar_url),
      'author_role', p.role,
      'content', up.content,
      'images', up.images,
      'like_count', up.like_count,
      'comment_count', up.comment_count,
      'has_liked', EXISTS (
        SELECT 1 FROM post_likes pl
        WHERE pl.post_id = up.id AND pl.user_id = v_user_id
      )
    )
    ORDER BY up.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT up2.id, up2.author_id, up2.content, up2.images,
           up2.like_count, up2.comment_count, up2.created_at
    FROM user_posts up2
    JOIN profiles p2 ON p2.id = up2.author_id
    WHERE up2.deleted_at IS NULL
      AND (v_is_test OR p2.is_test_account IS NULL OR p2.is_test_account = false)
      AND (p_roles IS NULL OR p2.role = ANY(p_roles))
      AND (
        p_country_ids IS NULL
        OR p2.role = 'brand'
        OR p2.nationality_country_id = ANY(p_country_ids)
      )
    ORDER BY up2.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) up
  JOIN profiles p ON p.id = up.author_id
  LEFT JOIN brands b ON b.profile_id = p.id;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_home_feed(INTEGER, INTEGER, TEXT, INTEGER[], TEXT[]) IS
  'Paginated home feed with optional country / role filters. Country filter passes through brand-authored items (brands are universal). Excludes member_joined cards. Respects test-account visibility.';

-- Reload PostgREST schema so the new signature is visible to clients
NOTIFY pgrst, 'reload schema';
