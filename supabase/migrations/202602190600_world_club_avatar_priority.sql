-- =============================================================================
-- World Club Avatar Priority: profile avatar > admin avatar
--
-- Rules:
--   Not claimed → Admin image (world_clubs.avatar_url)
--   Claimed + no upload → Keep admin image as default
--   Claimed + club uploads → Club image replaces admin image everywhere
--
-- Changes:
--   1. claim_world_club(): copy admin avatar to profile when profile has none
--   2. search_content(): flip COALESCE to prefer profile avatar
--   3. search_clubs_for_transfer(): flip COALESCE to prefer profile avatar
-- =============================================================================

-- 1. Update claim_world_club: copy club avatar to profile on claim
CREATE OR REPLACE FUNCTION public.claim_world_club(
  p_world_club_id UUID,
  p_profile_id UUID,
  p_men_league_id INT DEFAULT NULL,
  p_women_league_id INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club RECORD;
  v_men_league_name TEXT;
  v_women_league_name TEXT;
BEGIN
  -- Check if club exists and is not already claimed
  SELECT * INTO v_club FROM world_clubs WHERE id = p_world_club_id FOR UPDATE;

  IF v_club IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Club not found');
  END IF;

  IF v_club.is_claimed THEN
    RETURN json_build_object('success', false, 'error', 'Club has already been claimed');
  END IF;

  -- Get league names for profile update
  SELECT name INTO v_men_league_name FROM world_leagues WHERE id = p_men_league_id;
  SELECT name INTO v_women_league_name FROM world_leagues WHERE id = p_women_league_id;

  -- Claim the club
  UPDATE world_clubs
  SET
    is_claimed = true,
    claimed_profile_id = p_profile_id,
    claimed_at = timezone('utc', now()),
    men_league_id = p_men_league_id,
    women_league_id = p_women_league_id
  WHERE id = p_world_club_id;

  -- Update the profile with league info + inherit club avatar if profile has none
  UPDATE profiles
  SET
    mens_league_division = v_men_league_name,
    womens_league_division = v_women_league_name,
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = v_club.province_id,
    avatar_url = CASE
      WHEN avatar_url IS NULL AND v_club.avatar_url IS NOT NULL THEN v_club.avatar_url
      ELSE avatar_url
    END
  WHERE id = p_profile_id;

  RETURN json_build_object('success', true, 'club_id', p_world_club_id);
END;
$$;

-- 2. Update search_content: profile avatar takes priority over admin avatar
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
  v_sanitized TEXT;
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

  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- Strip special characters, collapse whitespace, build prefix-aware tsquery
  v_sanitized := regexp_replace(
    regexp_replace(v_normalized, '[^a-zA-Z0-9\s]', ' ', 'g'),
    '\s+', ' ', 'g'
  );
  v_sanitized := trim(v_sanitized);

  IF char_length(v_sanitized) < 1 THEN
    RETURN jsonb_build_object(
      'results', '[]'::jsonb,
      'total', 0,
      'type_counts', jsonb_build_object('posts', 0, 'people', 0, 'clubs', 0)
    );
  END IF;

  BEGIN
    v_tsquery := to_tsquery('english',
      regexp_replace(v_sanitized, '\s+', ':* & ', 'g') || ':*'
    );
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := plainto_tsquery('english', v_normalized);
  END;

  -- ==================== POSTS ====================
  IF p_type IS NULL OR p_type = 'posts' THEN
    SELECT COUNT(*) INTO v_post_count
    FROM user_posts up
    JOIN profiles p ON p.id = up.author_id
    WHERE up.deleted_at IS NULL
      AND up.search_vector @@ v_tsquery
      AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false);

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
    SELECT COUNT(*) INTO v_people_count
    FROM profiles p
    WHERE p.onboarding_completed = true
      AND (
        p.search_vector @@ v_tsquery
        OR p.full_name ILIKE '%' || v_normalized || '%'
      )
      AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false);

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
        AND (
          p.search_vector @@ v_tsquery
          OR p.full_name ILIKE '%' || v_normalized || '%'
        )
        AND (v_is_test OR p.is_test_account IS NULL OR p.is_test_account = false)
      ORDER BY rank DESC, p.full_name
      LIMIT CASE WHEN p_type = 'people' THEN p_limit ELSE 5 END
      OFFSET CASE WHEN p_type = 'people' THEN p_offset ELSE 0 END
    ) sub;
  END IF;

  -- ==================== CLUBS ====================
  IF p_type IS NULL OR p_type = 'clubs' THEN
    SELECT COUNT(*) INTO v_club_count
    FROM world_clubs wc
    WHERE wc.club_name_normalized LIKE '%' || lower(v_normalized) || '%';

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
          'avatar_url', COALESCE(p.avatar_url, wc.avatar_url),
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
COMMENT ON FUNCTION public.search_content IS 'Full-text search across posts, people, and clubs. Club avatars use COALESCE(profile avatar, world_club avatar) — claimed club owner image wins.';

-- 3. Update search_clubs_for_transfer: profile avatar takes priority
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
        'avatar_url', COALESCE(p.avatar_url, wc.avatar_url),
        'is_claimed', wc.is_claimed,
        'claimed_profile_id', wc.claimed_profile_id
      ) AS row_data,
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
COMMENT ON FUNCTION public.search_clubs_for_transfer IS 'Searches world_clubs by name for transfer announcements. Club avatars use COALESCE(profile avatar, world_club avatar) — claimed club owner image wins.';

NOTIFY pgrst, 'reload schema';
