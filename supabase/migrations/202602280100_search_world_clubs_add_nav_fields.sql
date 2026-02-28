-- Add province_slug, men_league_id, women_league_id to search_world_clubs()
-- so the frontend can navigate directly to the correct country/province page
-- and auto-select the league tab when a user searches for a club on the World page.
--
-- Must DROP first because PostgreSQL cannot change return type with CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.search_world_clubs(TEXT, INT);

CREATE FUNCTION public.search_world_clubs(
  p_query TEXT,
  p_limit INT DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  club_name TEXT,
  club_name_normalized TEXT,
  avatar_url TEXT,
  country_id INT,
  country_name TEXT,
  country_code TEXT,
  flag_emoji TEXT,
  province_id INT,
  province_name TEXT,
  province_slug TEXT,
  men_league_id INT,
  women_league_id INT,
  men_league_name TEXT,
  women_league_name TEXT,
  men_league_tier INT,
  women_league_tier INT,
  is_claimed BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := lower(trim(p_query));

  -- Require at least 2 characters
  IF length(v_normalized) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    wc.id,
    wc.club_name,
    wc.club_name_normalized,
    wc.avatar_url,
    wc.country_id,
    c.name AS country_name,
    c.code::TEXT AS country_code,
    c.flag_emoji,
    wc.province_id,
    wp.name AS province_name,
    wp.slug AS province_slug,
    wc.men_league_id,
    wc.women_league_id,
    ml.name AS men_league_name,
    wl.name AS women_league_name,
    ml.tier AS men_league_tier,
    wl.tier AS women_league_tier,
    wc.is_claimed
  FROM world_clubs wc
  JOIN countries c ON c.id = wc.country_id
  LEFT JOIN world_provinces wp ON wp.id = wc.province_id
  LEFT JOIN world_leagues ml ON ml.id = wc.men_league_id
  LEFT JOIN world_leagues wl ON wl.id = wc.women_league_id
  WHERE wc.club_name_normalized LIKE v_normalized || '%'
     OR wc.club_name_normalized LIKE '%' || v_normalized || '%'
  ORDER BY
    -- Prefix matches come first
    CASE WHEN wc.club_name_normalized LIKE v_normalized || '%' THEN 0 ELSE 1 END,
    wc.club_name ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_world_clubs(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_world_clubs(TEXT, INT) TO anon;
