-- Fix Argentina leagues missing country_id
-- Root cause: Argentina leagues were created in migration 1000 (before country_id column existed)
-- and migration 1010 updated logical_id but forgot to set country_id

BEGIN;

-- ============================================================================
-- STEP 1: Update Argentina leagues with correct country_id
-- ============================================================================
UPDATE public.world_leagues wl
SET country_id = wp.country_id
FROM public.world_provinces wp
WHERE wl.province_id = wp.id
  AND wl.country_id IS NULL;

-- ============================================================================
-- STEP 2: Fix the has_regions check in the view
-- ============================================================================
-- The original check was:
--   EXISTS (SELECT 1 FROM world_leagues wl WHERE wl.province_id IS NOT NULL AND wl.country_id = c.id)
-- This fails when leagues have province_id but no country_id (like Argentina)
-- Better approach: Check if there are any provinces for this country directly

CREATE OR REPLACE VIEW public.world_countries_with_directory AS
SELECT DISTINCT
  c.id AS country_id,
  c.code AS country_code,
  c.name AS country_name,
  c.flag_emoji,
  c.region,
  -- Does this country use regions? Check provinces table directly
  EXISTS (
    SELECT 1 FROM world_provinces wp 
    WHERE wp.country_id = c.id
  ) AS has_regions,
  -- Count leagues directly (no regions) + leagues via regions
  (
    SELECT COUNT(*) FROM world_leagues wl 
    WHERE (wl.country_id = c.id AND wl.province_id IS NULL)
       OR wl.province_id IN (SELECT id FROM world_provinces wp WHERE wp.country_id = c.id)
  ) AS total_leagues,
  -- Count clubs
  (SELECT COUNT(*) FROM world_clubs wc WHERE wc.country_id = c.id) AS total_clubs
FROM countries c
WHERE EXISTS (
  SELECT 1 FROM world_leagues wl 
  WHERE wl.country_id = c.id 
     OR wl.province_id IN (SELECT id FROM world_provinces wp WHERE wp.country_id = c.id)
)
ORDER BY c.name;

COMMENT ON VIEW public.world_countries_with_directory IS 'Countries with World directory support (have leagues seeded)';

COMMIT;
