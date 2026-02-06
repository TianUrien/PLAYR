-- Pre-Mass-Seeding Fixes
-- 1. Relax unique constraint: allow same club name in different regions of the same country
-- 2. Update create_and_claim_world_club() duplicate check to match new constraint
-- 3. Optimize world_countries_with_directory view for scale (eliminate correlated subqueries)

BEGIN;

-- ============================================================================
-- FIX A: Unique constraint — scope to (name, country, province)
-- ============================================================================
-- The old constraint UNIQUE(club_name_normalized, country_id) prevents clubs
-- with the same name in different regions of the same country (e.g. two
-- "Club Atlético" in Buenos Aires vs Córdoba). With mass seeding this will
-- cause INSERT failures.
--
-- New constraint uses a unique INDEX with COALESCE so that NULL province_id
-- values are treated as a distinct group (plain UNIQUE treats NULLs as
-- always-distinct, which would allow duplicates in region-less countries).

ALTER TABLE world_clubs
  DROP CONSTRAINT IF EXISTS world_clubs_club_name_normalized_country_id_key;

CREATE UNIQUE INDEX idx_world_clubs_name_country_province
  ON world_clubs (club_name_normalized, country_id, COALESCE(province_id, 0));

COMMENT ON INDEX idx_world_clubs_name_country_province IS
  'Prevents duplicate club names within the same country+region. COALESCE handles NULL province_id for region-less countries.';

-- ============================================================================
-- FIX A (cont.): Update create_and_claim_world_club() duplicate check
-- ============================================================================
-- Must match the new uniqueness scope: name + country + province

CREATE OR REPLACE FUNCTION public.create_and_claim_world_club(
  p_club_name TEXT,
  p_country_id INT,
  p_province_id INT DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL,
  p_men_league_id INT DEFAULT NULL,
  p_women_league_id INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_club_id TEXT;
  v_new_id UUID;
  v_existing RECORD;
  v_men_league_name TEXT;
  v_women_league_name TEXT;
BEGIN
  v_normalized := lower(trim(p_club_name));

  -- Duplicate check now scoped to country + province (matches new unique index)
  SELECT * INTO v_existing FROM world_clubs
  WHERE club_name_normalized = v_normalized
    AND country_id = p_country_id
    AND COALESCE(province_id, 0) = COALESCE(p_province_id, 0);

  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false,
      'error', 'A club with this name already exists in this region');
  END IF;

  -- Generate stable club_id
  v_club_id := replace(v_normalized, ' ', '_') || '_' || p_country_id || '_' || extract(epoch from now())::int;

  -- Get league names for profile denormalization
  SELECT name INTO v_men_league_name FROM world_leagues WHERE id = p_men_league_id;
  SELECT name INTO v_women_league_name FROM world_leagues WHERE id = p_women_league_id;

  -- Insert the new club (immediately claimed)
  INSERT INTO world_clubs (
    club_id, club_name, club_name_normalized, country_id, province_id,
    men_league_id, women_league_id, is_claimed, claimed_profile_id,
    claimed_at, created_from
  ) VALUES (
    v_club_id, p_club_name, v_normalized, p_country_id, p_province_id,
    p_men_league_id, p_women_league_id, true, p_profile_id,
    timezone('utc', now()), 'user'
  )
  RETURNING id INTO v_new_id;

  -- Sync league info to the profile
  UPDATE profiles
  SET
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = p_province_id,
    mens_league_division = v_men_league_name,
    womens_league_division = v_women_league_name
  WHERE id = p_profile_id;

  RETURN json_build_object('success', true, 'club_id', v_new_id, 'created', true);
END;
$$;

-- ============================================================================
-- FIX B: Optimize world_countries_with_directory view
-- ============================================================================
-- The old view used 3 correlated subqueries per country row (EXISTS for filter,
-- COUNT for leagues, COUNT for clubs). At scale this becomes O(countries × clubs).
-- Replace with pre-aggregated CTEs joined once.

DROP VIEW IF EXISTS public.world_countries_with_directory;

CREATE VIEW public.world_countries_with_directory
WITH (security_invoker = on)
AS
WITH country_leagues AS (
  -- Materialise league counts per country (both direct and via provinces)
  SELECT
    COALESCE(wl.country_id, wp.country_id) AS country_id,
    COUNT(*) AS total_leagues
  FROM world_leagues wl
  LEFT JOIN world_provinces wp ON wp.id = wl.province_id
  GROUP BY COALESCE(wl.country_id, wp.country_id)
),
country_clubs AS (
  -- Materialise club counts per country
  SELECT country_id, COUNT(*) AS total_clubs
  FROM world_clubs
  GROUP BY country_id
),
country_has_regions AS (
  -- One boolean per country
  SELECT DISTINCT country_id, true AS has_regions
  FROM world_provinces
)
SELECT
  c.id        AS country_id,
  c.code      AS country_code,
  c.name      AS country_name,
  c.flag_emoji,
  c.region,
  COALESCE(chr.has_regions, false) AS has_regions,
  COALESCE(cl.total_leagues, 0)   AS total_leagues,
  COALESCE(cc.total_clubs, 0)     AS total_clubs
FROM countries c
JOIN country_leagues cl ON cl.country_id = c.id      -- INNER JOIN: only countries with leagues
LEFT JOIN country_clubs cc ON cc.country_id = c.id
LEFT JOIN country_has_regions chr ON chr.country_id = c.id
ORDER BY c.name;

COMMENT ON VIEW public.world_countries_with_directory IS
  'Countries with World directory support (have leagues seeded). Optimised with pre-aggregated counts.';

COMMIT;
