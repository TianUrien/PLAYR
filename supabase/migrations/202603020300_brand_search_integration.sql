-- ============================================================================
-- Migration: Brand Search Integration
-- Date: 2026-03-02
-- Description: Adds brands to the global search system.
--   1. Adds search_vector column + GIN index + auto-update trigger to brands
--   2. Updates search_content() RPC to include a brands search block
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. Add search_vector to brands table
-- ============================================================================

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate existing rows
UPDATE public.brands
SET search_vector = to_tsvector('english',
  coalesce(name, '') || ' ' || coalesce(bio, '') || ' ' || coalesce(category, '')
)
WHERE deleted_at IS NULL;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION public.update_brands_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name, '') || ' ' || coalesce(NEW.bio, '') || ' ' || coalesce(NEW.category, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_brands_search ON public.brands;
CREATE TRIGGER trigger_update_brands_search
  BEFORE INSERT OR UPDATE OF name, bio, category
  ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.update_brands_search_vector();

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_brands_search ON public.brands USING GIN (search_vector);

-- ============================================================================
-- 2. Update search_content() RPC — add brands search block
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
  v_brand_results JSONB;
  v_post_count BIGINT := 0;
  v_people_count BIGINT := 0;
  v_club_count BIGINT := 0;
  v_brand_count BIGINT := 0;
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
      'type_counts', jsonb_build_object('posts', 0, 'people', 0, 'clubs', 0, 'brands', 0)
    );
  END IF;

  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  -- Strip special characters, collapse whitespace, build prefix-aware tsquery
  -- "John Sm" → 'john':* & 'sm':*
  v_sanitized := regexp_replace(
    regexp_replace(v_normalized, '[^a-zA-Z0-9\s]', ' ', 'g'),
    '\s+', ' ', 'g'
  );
  v_sanitized := trim(v_sanitized);

  IF char_length(v_sanitized) < 1 THEN
    RETURN jsonb_build_object(
      'results', '[]'::jsonb,
      'total', 0,
      'type_counts', jsonb_build_object('posts', 0, 'people', 0, 'clubs', 0, 'brands', 0)
    );
  END IF;

  BEGIN
    v_tsquery := to_tsquery('english',
      regexp_replace(v_sanitized, '\s+', ':* & ', 'g') || ':*'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: if tsquery parsing fails (unusual chars), use plainto_tsquery
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
  -- Uses FTS prefix matching + ILIKE fallback on full_name for names
  -- that FTS may miss (stop words, non-English names, short tokens)
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

  -- ==================== BRANDS ====================
  IF p_type IS NULL OR p_type = 'brands' THEN
    SELECT COUNT(*) INTO v_brand_count
    FROM brands b
    WHERE b.deleted_at IS NULL
      AND (
        b.search_vector @@ v_tsquery
        OR lower(b.name) LIKE '%' || lower(v_normalized) || '%'
      );

    SELECT COALESCE(jsonb_agg(row_data ORDER BY rank, brand_name), '[]'::jsonb)
    INTO v_brand_results
    FROM (
      SELECT
        jsonb_build_object(
          'result_type', 'brand',
          'brand_id', b.id,
          'brand_slug', b.slug,
          'brand_name', b.name,
          'brand_logo_url', b.logo_url,
          'brand_category', b.category,
          'brand_is_verified', b.is_verified,
          'brand_bio', b.bio
        ) AS row_data,
        CASE WHEN lower(b.name) LIKE lower(v_normalized) || '%' THEN 0 ELSE 1 END AS rank,
        b.name AS brand_name
      FROM brands b
      WHERE b.deleted_at IS NULL
        AND (
          b.search_vector @@ v_tsquery
          OR lower(b.name) LIKE '%' || lower(v_normalized) || '%'
        )
      ORDER BY rank, b.name
      LIMIT CASE WHEN p_type = 'brands' THEN p_limit ELSE 5 END
      OFFSET CASE WHEN p_type = 'brands' THEN p_offset ELSE 0 END
    ) sub;
  END IF;

  -- Combine results based on type filter
  IF p_type = 'posts' THEN
    v_results := COALESCE(v_post_results, '[]'::jsonb);
  ELSIF p_type = 'people' THEN
    v_results := COALESCE(v_people_results, '[]'::jsonb);
  ELSIF p_type = 'clubs' THEN
    v_results := COALESCE(v_club_results, '[]'::jsonb);
  ELSIF p_type = 'brands' THEN
    v_results := COALESCE(v_brand_results, '[]'::jsonb);
  ELSE
    v_results := COALESCE(v_post_results, '[]'::jsonb)
              || COALESCE(v_people_results, '[]'::jsonb)
              || COALESCE(v_club_results, '[]'::jsonb)
              || COALESCE(v_brand_results, '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'results', v_results,
    'total', v_post_count + v_people_count + v_club_count + v_brand_count,
    'type_counts', jsonb_build_object(
      'posts', v_post_count,
      'people', v_people_count,
      'clubs', v_club_count,
      'brands', v_brand_count
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_content(TEXT, TEXT, INT, INT) TO authenticated;
COMMENT ON FUNCTION public.search_content IS 'Full-text search across posts, people, clubs, and brands. Returns combined results with type counts. Respects test account visibility.';

NOTIFY pgrst, 'reload schema';
