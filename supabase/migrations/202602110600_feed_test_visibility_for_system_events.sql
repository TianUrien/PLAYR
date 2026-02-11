-- ============================================================================
-- Migration: Test Visibility for System Feed Events
-- Date: 2026-02-11
-- Description: System event triggers (member_joined, opportunity_posted,
--   reference_received, milestones, brand_post, brand_product) were skipping
--   test accounts entirely — feed items were never created.
--
--   User posts already had dynamic test visibility (test viewers see test
--   posts), but system events did not. This caused test accounts to see no
--   system events in the feed at all.
--
--   Fix: Add `is_test_account` column to home_feed_items. Triggers now
--   ALWAYS create feed items (regardless of test status) and set the flag.
--   get_home_feed() filters system events dynamically — same pattern as
--   user_posts. Test viewers see everything; non-test viewers see only
--   non-test items.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. ADD is_test_account COLUMN
-- ============================================================================

ALTER TABLE public.home_feed_items
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- 2. RECREATE ALL TRIGGER FUNCTIONS
-- ============================================================================

-- 2a. MEMBER JOINED
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

    INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
    VALUES (
      'member_joined',
      NEW.id,
      'profile',
      COALESCE(NEW.is_test_account, false),
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

-- 2b. OPPORTUNITY POSTED
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

    SELECT p.id, p.full_name, p.avatar_url, p.is_test_account
    INTO v_club_profile
    FROM profiles p
    WHERE p.id = NEW.club_id;

    INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
    VALUES (
      'opportunity_posted',
      NEW.id,
      'vacancy',
      COALESCE(v_club_profile.is_test_account, false),
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

-- 2c. REFERENCE RECEIVED
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

    SELECT id, full_name, avatar_url, role, is_test_account
    INTO v_requester_profile
    FROM profiles
    WHERE id = NEW.requester_id;

    SELECT id, full_name, avatar_url, role
    INTO v_referee_profile
    FROM profiles
    WHERE id = NEW.reference_id;

    INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
    VALUES (
      'reference_received',
      NEW.id,
      'profile_reference',
      COALESCE(v_requester_profile.is_test_account, false),
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

-- 2d. FIRST VIDEO MILESTONE
CREATE OR REPLACE FUNCTION public.check_first_video_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.highlight_video_url IS NOT NULL
     AND NEW.highlight_video_url != ''
     AND (OLD.highlight_video_url IS NULL OR OLD.highlight_video_url = '') THEN

    PERFORM record_milestone(
      NEW.id,
      'first_video',
      COALESCE(NEW.is_test_account, false),
      jsonb_build_object(
        'profile_id', NEW.id,
        'full_name', NEW.full_name,
        'avatar_url', NEW.avatar_url,
        'role', NEW.role,
        'video_url', NEW.highlight_video_url
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2e. FIRST GALLERY IMAGE MILESTONE
CREATE OR REPLACE FUNCTION public.check_first_gallery_image_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_image_count INTEGER;
  v_profile RECORD;
BEGIN
  SELECT COUNT(*) INTO v_image_count
  FROM gallery_photos
  WHERE user_id = NEW.user_id;

  IF v_image_count = 1 THEN
    SELECT id, full_name, avatar_url, role, is_test_account
    INTO v_profile
    FROM profiles
    WHERE id = NEW.user_id;

    PERFORM record_milestone(
      NEW.user_id,
      'first_gallery_image',
      COALESCE(v_profile.is_test_account, false),
      jsonb_build_object(
        'profile_id', v_profile.id,
        'full_name', v_profile.full_name,
        'avatar_url', v_profile.avatar_url,
        'role', v_profile.role,
        'image_url', NEW.photo_url
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 2f. PROFILE 100% COMPLETION MILESTONE
CREATE OR REPLACE FUNCTION public.check_profile_completion_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_complete BOOLEAN := false;
BEGIN
  IF NEW.onboarding_completed = true THEN
    IF NEW.role IN ('player', 'coach') THEN
      v_is_complete := (
        NEW.full_name IS NOT NULL AND NEW.full_name != '' AND
        NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' AND
        NEW.bio IS NOT NULL AND NEW.bio != '' AND
        NEW.nationality_country_id IS NOT NULL AND
        NEW.highlight_video_url IS NOT NULL AND NEW.highlight_video_url != ''
      );
    ELSIF NEW.role = 'club' THEN
      v_is_complete := (
        NEW.full_name IS NOT NULL AND NEW.full_name != '' AND
        NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' AND
        NEW.club_bio IS NOT NULL AND NEW.club_bio != '' AND
        NEW.base_location IS NOT NULL AND NEW.base_location != ''
      );
    END IF;

    IF v_is_complete THEN
      PERFORM record_milestone(
        NEW.id,
        'profile_100_percent',
        COALESCE(NEW.is_test_account, false),
        jsonb_build_object(
          'profile_id', NEW.id,
          'full_name', NEW.full_name,
          'avatar_url', NEW.avatar_url,
          'role', NEW.role
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2g. BRAND POST PUBLISHED
CREATE OR REPLACE FUNCTION public.generate_brand_post_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.is_verified, b.deleted_at,
    p.is_test_account
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  -- Skip if brand is deleted (but NOT if test account — handled at query time)
  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
  VALUES (
    'brand_post',
    NEW.id,
    'brand_post',
    COALESCE(v_brand.is_test_account, false),
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

-- 2h. BRAND PRODUCT PUBLISHED
CREATE OR REPLACE FUNCTION public.generate_brand_product_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand RECORD;
BEGIN
  SELECT
    b.id, b.name, b.slug, b.logo_url, b.category, b.is_verified, b.deleted_at,
    p.is_test_account
  INTO v_brand
  FROM brands b
  JOIN profiles p ON p.id = b.profile_id
  WHERE b.id = NEW.brand_id;

  -- Skip if brand is deleted (but NOT if test account — handled at query time)
  IF v_brand.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
  VALUES (
    'brand_product',
    NEW.id,
    'brand_product',
    COALESCE(v_brand.is_test_account, false),
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

-- ============================================================================
-- 3. UPDATE record_milestone HELPER (add is_test_account parameter)
-- ============================================================================

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
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM profile_milestones
    WHERE profile_id = p_profile_id
      AND milestone_type = p_milestone_type
  ) INTO v_already_exists;

  IF v_already_exists THEN
    RETURN FALSE;
  END IF;

  INSERT INTO profile_milestones (profile_id, milestone_type)
  VALUES (p_profile_id, p_milestone_type);

  INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, metadata)
  VALUES (
    'milestone_achieved',
    gen_random_uuid(),
    'milestone',
    COALESCE(p_is_test_account, false),
    p_metadata || jsonb_build_object('milestone_type', p_milestone_type)
  );

  RETURN TRUE;
END;
$$;

-- Drop old 3-argument overload if it exists (from original migration)
DROP FUNCTION IF EXISTS public.record_milestone(UUID, TEXT, JSONB);

-- ============================================================================
-- 4. UPDATE get_home_feed() — filter system events by test status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0,
  p_item_type TEXT DEFAULT NULL
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
  -- Check if the current viewer is a test account
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- If filtering by a specific system type
  IF p_item_type IS NOT NULL AND p_item_type != 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items
    WHERE deleted_at IS NULL AND item_type = p_item_type
      AND (v_is_test OR is_test_account = false);

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
      FROM home_feed_items
      WHERE deleted_at IS NULL AND item_type = p_item_type
        AND (v_is_test OR is_test_account = false)
      ORDER BY created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) hfi;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- If filtering by user_post only
  IF p_item_type = 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM user_posts up
    JOIN profiles p ON p.id = up.author_id
    WHERE up.deleted_at IS NULL
      AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false);

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
      ORDER BY up2.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) up
    JOIN profiles p ON p.id = up.author_id
    LEFT JOIN brands b ON b.profile_id = p.id;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- Default: UNION of system posts + user posts (unified feed)

  -- Count total from both sources
  SELECT (
    (SELECT COUNT(*) FROM home_feed_items
     WHERE deleted_at IS NULL
       AND (v_is_test OR is_test_account = false)) +
    (SELECT COUNT(*)
     FROM user_posts up
     JOIN profiles p ON p.id = up.author_id
     WHERE up.deleted_at IS NULL
       AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false))
  ) INTO v_total;

  -- Fetch paginated items from unified feed
  SELECT COALESCE(jsonb_agg(
    c.item_data ORDER BY c.created_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT item_data, created_at
    FROM (
      -- System posts (filtered by viewer test status)
      SELECT
        hfi.created_at,
        hfi.metadata || jsonb_build_object(
          'feed_item_id', hfi.id,
          'item_type', hfi.item_type,
          'created_at', hfi.created_at
        ) AS item_data
      FROM home_feed_items hfi
      WHERE hfi.deleted_at IS NULL
        AND (v_is_test OR hfi.is_test_account = false)

      UNION ALL

      -- User posts (filtered by viewer test status)
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
    ) unified
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) c;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_home_feed IS 'Fetches paginated home feed with system posts + user posts unified. Test account items visible only to test account viewers. Brand names resolved from brands table.';
