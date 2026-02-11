-- ============================================================================
-- Migration: Transfer Announcement Posts
-- Date: 2026-02-11
-- Description: Adds structured transfer announcement post type to user_posts.
--   Players/coaches can announce joining a club with structured metadata,
--   club search, and a visually distinct feed card. Extends user_posts with
--   post_type and metadata columns. Includes search RPC for club lookup,
--   create RPC for transfer posts, and updated get_home_feed to include
--   the new fields.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. Schema: Add post_type and metadata to user_posts
-- ============================================================================

ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'text'
    CHECK (post_type IN ('text', 'transfer'));

ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Index for querying transfer posts by author (e.g., transfer history)
CREATE INDEX IF NOT EXISTS idx_user_posts_transfer
  ON public.user_posts (author_id, created_at DESC)
  WHERE post_type = 'transfer' AND deleted_at IS NULL;

COMMENT ON COLUMN public.user_posts.post_type IS 'Post type discriminator: text (default free-text), transfer (club announcement)';
COMMENT ON COLUMN public.user_posts.metadata IS 'Structured data for typed posts (e.g., transfer club info as JSONB)';

-- ============================================================================
-- 2. RPC: search_clubs_for_transfer
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_clubs_for_transfer(
  p_query TEXT,
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results JSONB;
  v_normalized TEXT;
BEGIN
  v_normalized := lower(trim(p_query));

  IF char_length(v_normalized) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY rank, club_name), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      jsonb_build_object(
        'id', wc.id,
        'name', wc.club_name,
        'country_id', wc.country_id,
        'country_code', c.code,
        'country_name', c.name,
        'flag_emoji', c.flag_emoji,
        'avatar_url', p.avatar_url,
        'is_claimed', wc.is_claimed,
        'claimed_profile_id', wc.claimed_profile_id
      ) AS row_data,
      -- Prefix matches rank higher
      CASE WHEN wc.club_name_normalized LIKE v_normalized || '%' THEN 0 ELSE 1 END AS rank,
      wc.club_name
    FROM world_clubs wc
    JOIN countries c ON c.id = wc.country_id
    LEFT JOIN profiles p ON p.id = wc.claimed_profile_id
    WHERE wc.club_name_normalized LIKE '%' || v_normalized || '%'
    ORDER BY rank, wc.club_name
    LIMIT p_limit
  ) sub;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_clubs_for_transfer(TEXT, INT) TO authenticated;
COMMENT ON FUNCTION public.search_clubs_for_transfer IS 'Searches world_clubs by name for transfer announcements. Returns club info with country and avatar.';

-- ============================================================================
-- 3. RPC: create_transfer_post
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_transfer_post(
  p_club_name TEXT,
  p_club_country_id INT DEFAULT NULL,
  p_world_club_id UUID DEFAULT NULL,
  p_club_avatar_url TEXT DEFAULT NULL,
  p_content TEXT DEFAULT NULL,
  p_images JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_post_id UUID;
  v_trimmed TEXT;
  v_metadata JSONB;
  v_rate_check JSONB;
  v_is_test BOOLEAN;
  v_country RECORD;
  v_club_avatar TEXT;
  v_club_profile_id UUID;
  v_is_known_club BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Rate limit check (same pool as regular posts)
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  IF NOT v_is_test THEN
    v_rate_check := public.check_rate_limit(v_user_id::TEXT, 'create_post', 10, 3600);
    IF NOT (v_rate_check ->> 'allowed')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Rate limit exceeded: maximum 10 posts per hour'
      );
    END IF;
  END IF;

  -- Validate club name
  IF trim(COALESCE(p_club_name, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club name is required');
  END IF;

  -- Resolve country info
  IF p_club_country_id IS NOT NULL THEN
    SELECT id, code, name INTO v_country
    FROM countries WHERE id = p_club_country_id;
  END IF;

  -- Start with user-provided avatar (for unknown clubs with uploaded logo)
  v_club_avatar := p_club_avatar_url;

  -- Resolve club avatar and profile from world_clubs if provided
  IF p_world_club_id IS NOT NULL THEN
    SELECT wc.claimed_profile_id INTO v_club_profile_id
    FROM world_clubs wc WHERE wc.id = p_world_club_id;

    IF v_club_profile_id IS NOT NULL THEN
      SELECT avatar_url INTO v_club_avatar
      FROM profiles WHERE id = v_club_profile_id;
    END IF;
    v_is_known_club := true;
  END IF;

  -- Build metadata
  v_metadata := jsonb_build_object(
    'club_name', trim(p_club_name),
    'club_country_id', p_club_country_id,
    'club_country_code', v_country.code,
    'club_country_name', v_country.name,
    'club_avatar_url', v_club_avatar,
    'world_club_id', p_world_club_id,
    'club_profile_id', v_club_profile_id,
    'is_known_club', v_is_known_club
  );

  -- Use provided content or generate default
  v_trimmed := trim(COALESCE(p_content, ''));
  IF v_trimmed = '' THEN
    v_trimmed := 'Joined ' || trim(p_club_name) || '!';
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Content exceeds 2000 character limit');
  END IF;

  -- Validate images
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 4 images allowed');
  END IF;

  -- Insert the transfer post
  INSERT INTO user_posts (author_id, content, images, post_type, metadata)
  VALUES (v_user_id, v_trimmed, p_images, 'transfer', v_metadata)
  RETURNING id INTO v_post_id;

  -- Auto-update the player's current_club on their profile
  UPDATE profiles
  SET current_club = trim(p_club_name)
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transfer_post(TEXT, INT, UUID, TEXT, TEXT, JSONB) TO authenticated;
COMMENT ON FUNCTION public.create_transfer_post IS 'Creates a transfer announcement post with structured club metadata. Auto-updates profile current_club.';

-- ============================================================================
-- 4. Update get_home_feed to include post_type and metadata
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

  -- If filtering by a specific system type, use original logic
  IF p_item_type IS NOT NULL AND p_item_type != 'user_post' THEN
    SELECT COUNT(*) INTO v_total
    FROM home_feed_items
    WHERE deleted_at IS NULL AND item_type = p_item_type;

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
        'author_name', p.full_name,
        'author_avatar', p.avatar_url,
        'author_role', p.role,
        'content', up.content,
        'images', up.images,
        'like_count', up.like_count,
        'comment_count', up.comment_count,
        'has_liked', EXISTS (
          SELECT 1 FROM post_likes pl
          WHERE pl.post_id = up.id AND pl.user_id = v_user_id
        ),
        'post_type', COALESCE(up.post_type, 'text'),
        'metadata', up.metadata
      )
      ORDER BY up.created_at DESC
    ), '[]'::jsonb)
    INTO v_items
    FROM (
      SELECT up2.id, up2.author_id, up2.content, up2.images,
             up2.like_count, up2.comment_count, up2.created_at,
             up2.post_type, up2.metadata
      FROM user_posts up2
      JOIN profiles p2 ON p2.id = up2.author_id
      WHERE up2.deleted_at IS NULL
        AND (v_is_test OR p2.is_test_account IS NULL OR p2.is_test_account = false)
      ORDER BY up2.created_at DESC
      LIMIT p_limit OFFSET p_offset
    ) up
    JOIN profiles p ON p.id = up.author_id;

    RETURN jsonb_build_object('items', v_items, 'total', v_total);
  END IF;

  -- Default: UNION of system posts + user posts (unified feed)

  -- Count total from both sources (conditionally exclude test user posts)
  SELECT (
    (SELECT COUNT(*) FROM home_feed_items WHERE deleted_at IS NULL) +
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
      -- System posts (already filtered at trigger insert time)
      SELECT
        hfi.created_at,
        hfi.metadata || jsonb_build_object(
          'feed_item_id', hfi.id,
          'item_type', hfi.item_type,
          'created_at', hfi.created_at
        ) AS item_data
      FROM home_feed_items hfi
      WHERE hfi.deleted_at IS NULL

      UNION ALL

      -- User posts (exclude test account authors unless viewer is test)
      SELECT
        up.created_at,
        jsonb_build_object(
          'feed_item_id', up.id,
          'item_type', 'user_post',
          'created_at', up.created_at,
          'post_id', up.id,
          'author_id', up.author_id,
          'author_name', p.full_name,
          'author_avatar', p.avatar_url,
          'author_role', p.role,
          'content', up.content,
          'images', up.images,
          'like_count', up.like_count,
          'comment_count', up.comment_count,
          'has_liked', EXISTS (
            SELECT 1 FROM post_likes pl
            WHERE pl.post_id = up.id AND pl.user_id = v_user_id
          ),
          'post_type', COALESCE(up.post_type, 'text'),
          'metadata', up.metadata
        ) AS item_data
      FROM user_posts up
      JOIN profiles p ON p.id = up.author_id
      WHERE up.deleted_at IS NULL
        AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
    ) unified
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) c;

  RETURN jsonb_build_object('items', v_items, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.get_home_feed IS 'Fetches paginated home feed with system posts + user posts unified. Includes post_type and metadata for structured posts. Test account posts visible only to test account viewers.';
