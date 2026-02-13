-- ============================================================================
-- Migration: Rich Media Feed — Video Support, FTS, Search
-- Date: 2026-02-13
-- Description: Evolves the Home feed with:
--   1. Full-text search on user_posts (tsvector + GIN index + auto-update trigger)
--   2. Full-text search on profiles (full_name, bio, position, current_club)
--   3. Updated create/update/transfer RPCs: max 5 media items, video validation
--   4. New search_content() RPC for searching posts, people, and clubs
--   5. Fixes get_home_feed regression: restores post_type + metadata fields
--
-- JSONB media format evolution (backward compatible — no column rename):
--   Existing: [{ url, order }]
--   Extended: [{ url, thumb_url?, media_type?, width?, height?, duration?, order }]
--   Items without media_type are treated as 'image' by the frontend.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. FULL-TEXT SEARCH: user_posts
-- ============================================================================

-- Add tsvector column
ALTER TABLE public.user_posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION public.update_user_posts_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_posts_search_vector ON public.user_posts;
CREATE TRIGGER trg_user_posts_search_vector
  BEFORE INSERT OR UPDATE OF content ON public.user_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_user_posts_search_vector();

-- Backfill existing rows
UPDATE public.user_posts
SET search_vector = to_tsvector('english', coalesce(content, ''))
WHERE search_vector IS NULL;

-- GIN index for fast FTS
CREATE INDEX IF NOT EXISTS idx_user_posts_search
  ON public.user_posts USING GIN (search_vector);

-- ============================================================================
-- 2. FULL-TEXT SEARCH: profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

CREATE OR REPLACE FUNCTION public.update_profiles_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.full_name, '') || ' ' ||
    coalesce(NEW.bio, '') || ' ' ||
    coalesce(NEW.club_bio, '') || ' ' ||
    coalesce(NEW.position, '') || ' ' ||
    coalesce(NEW.current_club, '') || ' ' ||
    coalesce(NEW.base_location, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_search_vector ON public.profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE OF full_name, bio, club_bio, position, current_club, base_location
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_search_vector();

-- Backfill existing profiles
UPDATE public.profiles
SET search_vector = to_tsvector('english',
  coalesce(full_name, '') || ' ' ||
  coalesce(bio, '') || ' ' ||
  coalesce(club_bio, '') || ' ' ||
  coalesce(position, '') || ' ' ||
  coalesce(current_club, '') || ' ' ||
  coalesce(base_location, '')
)
WHERE search_vector IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_search
  ON public.profiles USING GIN (search_vector);

-- ============================================================================
-- 3. UPDATE create_user_post — max 5 media, video validation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_user_post(
  p_content TEXT,
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
  v_video_count INT;
  v_duration NUMERIC;
  v_item JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_trimmed := trim(p_content);

  -- Validate content
  IF v_trimmed = '' OR char_length(v_trimmed) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content is required');
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content exceeds 2000 character limit');
  END IF;

  -- Validate media (max 5 items)
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 media items allowed');
  END IF;

  -- Validate video constraints: max 1 video, duration <= 180s
  IF p_images IS NOT NULL THEN
    v_video_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_images)
    LOOP
      IF v_item ->> 'media_type' = 'video' THEN
        v_video_count := v_video_count + 1;
        v_duration := (v_item ->> 'duration')::NUMERIC;
        IF v_duration IS NOT NULL AND v_duration > 180 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Video must be 3 minutes or less');
        END IF;
      END IF;
    END LOOP;

    IF v_video_count > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maximum 1 video per post');
    END IF;
  END IF;

  INSERT INTO user_posts (author_id, content, images)
  VALUES (v_user_id, v_trimmed, p_images)
  RETURNING id INTO v_post_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_post(TEXT, JSONB) TO authenticated;

-- ============================================================================
-- 4. UPDATE update_user_post — max 5 media, video validation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_post(
  p_post_id UUID,
  p_content TEXT,
  p_images JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_trimmed TEXT;
  v_owner_id UUID;
  v_video_count INT;
  v_duration NUMERIC;
  v_item JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Check ownership
  SELECT author_id INTO v_owner_id
  FROM user_posts
  WHERE id = p_post_id AND deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post not found');
  END IF;

  IF v_owner_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  v_trimmed := trim(p_content);

  IF v_trimmed = '' OR char_length(v_trimmed) < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content is required');
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Post content exceeds 2000 character limit');
  END IF;

  -- Validate media (max 5 items)
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 media items allowed');
  END IF;

  -- Validate video constraints
  IF p_images IS NOT NULL THEN
    v_video_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_images)
    LOOP
      IF v_item ->> 'media_type' = 'video' THEN
        v_video_count := v_video_count + 1;
        v_duration := (v_item ->> 'duration')::NUMERIC;
        IF v_duration IS NOT NULL AND v_duration > 180 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Video must be 3 minutes or less');
        END IF;
      END IF;
    END LOOP;

    IF v_video_count > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maximum 1 video per post');
    END IF;
  END IF;

  UPDATE user_posts
  SET content = v_trimmed,
      images = p_images,
      updated_at = timezone('utc', now())
  WHERE id = p_post_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_post(UUID, TEXT, JSONB) TO authenticated;

-- ============================================================================
-- 5. UPDATE create_transfer_post — max 5 media, video validation
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
  v_country_code TEXT := NULL;
  v_country_name TEXT := NULL;
  v_club_avatar TEXT;
  v_club_profile_id UUID;
  v_is_known_club BOOLEAN := false;
  v_video_count INT;
  v_duration NUMERIC;
  v_item JSONB;
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

  -- Resolve country info (only if country_id provided)
  IF p_club_country_id IS NOT NULL THEN
    SELECT code, name INTO v_country_code, v_country_name
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
    'club_country_code', v_country_code,
    'club_country_name', v_country_name,
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

  -- Validate media (max 5 items)
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 5 media items allowed');
  END IF;

  -- Validate video constraints
  IF p_images IS NOT NULL THEN
    v_video_count := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_images)
    LOOP
      IF v_item ->> 'media_type' = 'video' THEN
        v_video_count := v_video_count + 1;
        v_duration := (v_item ->> 'duration')::NUMERIC;
        IF v_duration IS NOT NULL AND v_duration > 180 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Video must be 3 minutes or less');
        END IF;
      END IF;
    END LOOP;

    IF v_video_count > 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Maximum 1 video per post');
    END IF;
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

-- ============================================================================
-- 6. UPDATE get_home_feed — restore post_type + metadata (regression fix)
-- ============================================================================
-- Migration 202602110400 accidentally dropped post_type and metadata fields
-- from the user_post JSONB output. This restores them while keeping all other
-- fixes (brand name COALESCE, test account visibility, system event filtering).

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
          ),
          'post_type', COALESCE(up.post_type, 'text'),
          'metadata', up.metadata
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

COMMENT ON FUNCTION public.get_home_feed IS 'Fetches paginated home feed with system posts + user posts unified. Includes post_type and metadata for structured posts. Test account items visible only to test account viewers. Brand names resolved from brands table.';

-- ============================================================================
-- 7. NEW RPC: search_content — full-text search across posts, people, clubs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_content(
  p_query TEXT,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_test BOOLEAN;
  v_tsquery tsquery;
  v_results JSONB := '[]'::jsonb;
  v_post_results JSONB;
  v_people_results JSONB;
  v_club_results JSONB;
  v_post_count BIGINT := 0;
  v_people_count BIGINT := 0;
  v_club_count BIGINT := 0;
  v_normalized TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  v_normalized := trim(p_query);
  IF char_length(v_normalized) < 2 THEN
    RETURN jsonb_build_object(
      'results', '[]'::jsonb,
      'total', 0,
      'type_counts', jsonb_build_object('posts', 0, 'people', 0, 'clubs', 0)
    );
  END IF;

  -- Check test account status
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- Build tsquery (handles multi-word queries)
  v_tsquery := plainto_tsquery('english', v_normalized);

  -- ==================== POSTS ====================
  IF p_type IS NULL OR p_type = 'posts' THEN
    -- Count
    SELECT COUNT(*) INTO v_post_count
    FROM user_posts up
    JOIN profiles p ON p.id = up.author_id
    WHERE up.deleted_at IS NULL
      AND up.search_vector @@ v_tsquery
      AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false);

    -- Results
    SELECT COALESCE(jsonb_agg(row_data ORDER BY rank DESC), '[]'::jsonb)
    INTO v_post_results
    FROM (
      SELECT
        jsonb_build_object(
          'result_type', 'post',
          'post_id', up.id,
          'content', up.content,
          'images', up.images,
          'author_id', up.author_id,
          'author_name', COALESCE(b.name, p.full_name),
          'author_avatar', COALESCE(b.logo_url, p.avatar_url),
          'author_role', p.role,
          'like_count', up.like_count,
          'comment_count', up.comment_count,
          'post_type', COALESCE(up.post_type, 'text'),
          'created_at', up.created_at
        ) AS row_data,
        ts_rank(up.search_vector, v_tsquery) AS rank
      FROM user_posts up
      JOIN profiles p ON p.id = up.author_id
      LEFT JOIN brands b ON b.profile_id = p.id
      WHERE up.deleted_at IS NULL
        AND up.search_vector @@ v_tsquery
        AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
      ORDER BY rank DESC, up.created_at DESC
      LIMIT CASE WHEN p_type = 'posts' THEN p_limit ELSE 5 END
      OFFSET CASE WHEN p_type = 'posts' THEN p_offset ELSE 0 END
    ) sub;
  END IF;

  -- ==================== PEOPLE ====================
  IF p_type IS NULL OR p_type = 'people' THEN
    -- Count
    SELECT COUNT(*) INTO v_people_count
    FROM profiles p
    WHERE p.onboarding_completed = true
      AND p.search_vector @@ v_tsquery
      AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false);

    -- Results
    SELECT COALESCE(jsonb_agg(row_data ORDER BY rank DESC), '[]'::jsonb)
    INTO v_people_results
    FROM (
      SELECT
        jsonb_build_object(
          'result_type', 'person',
          'profile_id', p.id,
          'full_name', COALESCE(b.name, p.full_name),
          'avatar_url', COALESCE(b.logo_url, p.avatar_url),
          'role', p.role,
          'bio', COALESCE(p.bio, p.club_bio),
          'position', p.position,
          'base_location', p.base_location,
          'current_club', p.current_club
        ) AS row_data,
        ts_rank(p.search_vector, v_tsquery) AS rank
      FROM profiles p
      LEFT JOIN brands b ON b.profile_id = p.id
      WHERE p.onboarding_completed = true
        AND p.search_vector @@ v_tsquery
        AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
      ORDER BY rank DESC, p.full_name
      LIMIT CASE WHEN p_type = 'people' THEN p_limit ELSE 5 END
      OFFSET CASE WHEN p_type = 'people' THEN p_offset ELSE 0 END
    ) sub;
  END IF;

  -- ==================== CLUBS ====================
  IF p_type IS NULL OR p_type = 'clubs' THEN
    -- Count (ILIKE for club names — no FTS on world_clubs)
    SELECT COUNT(*) INTO v_club_count
    FROM world_clubs wc
    WHERE wc.club_name_normalized LIKE '%' || lower(v_normalized) || '%';

    -- Results
    SELECT COALESCE(jsonb_agg(row_data ORDER BY rank, club_name), '[]'::jsonb)
    INTO v_club_results
    FROM (
      SELECT
        jsonb_build_object(
          'result_type', 'club',
          'world_club_id', wc.id,
          'club_name', wc.club_name,
          'country_id', wc.country_id,
          'country_code', c.code,
          'country_name', c.name,
          'flag_emoji', c.flag_emoji,
          'avatar_url', p.avatar_url,
          'is_claimed', wc.is_claimed,
          'claimed_profile_id', wc.claimed_profile_id
        ) AS row_data,
        CASE WHEN wc.club_name_normalized LIKE lower(v_normalized) || '%' THEN 0 ELSE 1 END AS rank,
        wc.club_name
      FROM world_clubs wc
      JOIN countries c ON c.id = wc.country_id
      LEFT JOIN profiles p ON p.id = wc.claimed_profile_id
      WHERE wc.club_name_normalized LIKE '%' || lower(v_normalized) || '%'
      ORDER BY rank, wc.club_name
      LIMIT CASE WHEN p_type = 'clubs' THEN p_limit ELSE 5 END
      OFFSET CASE WHEN p_type = 'clubs' THEN p_offset ELSE 0 END
    ) sub;
  END IF;

  -- Combine results based on type filter
  IF p_type = 'posts' THEN
    v_results := COALESCE(v_post_results, '[]'::jsonb);
  ELSIF p_type = 'people' THEN
    v_results := COALESCE(v_people_results, '[]'::jsonb);
  ELSIF p_type = 'clubs' THEN
    v_results := COALESCE(v_club_results, '[]'::jsonb);
  ELSE
    -- Interleave: posts first, then people, then clubs
    v_results := COALESCE(v_post_results, '[]'::jsonb)
              || COALESCE(v_people_results, '[]'::jsonb)
              || COALESCE(v_club_results, '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'results', v_results,
    'total', v_post_count + v_people_count + v_club_count,
    'type_counts', jsonb_build_object(
      'posts', v_post_count,
      'people', v_people_count,
      'clubs', v_club_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_content(TEXT, TEXT, INT, INT) TO authenticated;
COMMENT ON FUNCTION public.search_content IS 'Full-text search across posts (tsvector), people (tsvector), and clubs (ILIKE). Returns combined results with type counts. Respects test account visibility.';
