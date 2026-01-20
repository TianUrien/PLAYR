-- Fix Security Definer Views
-- Supabase Security Advisor flagged these views as SECURITY DEFINER
-- They should use SECURITY INVOKER to respect RLS policies of the calling user

BEGIN;

-- ============================================================================
-- Fix world_countries_with_directory view
-- Must DROP and recreate to change security property
-- ============================================================================
DROP VIEW IF EXISTS public.world_countries_with_directory;

CREATE VIEW public.world_countries_with_directory
WITH (security_invoker = on)
AS
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

-- ============================================================================
-- Fix world_province_stats view
-- Must DROP and recreate to change security property
-- ============================================================================
DROP VIEW IF EXISTS public.world_province_stats;

CREATE VIEW public.world_province_stats
WITH (security_invoker = on)
AS
SELECT 
  wp.id AS province_id,
  wp.country_id,
  wp.name AS province_name,
  wp.slug,
  wp.description,
  wp.display_order,
  c.code AS country_code,
  c.name AS country_name,
  COUNT(DISTINCT wc.id) AS total_clubs,
  COUNT(DISTINCT wc.id) FILTER (WHERE wc.is_claimed) AS claimed_clubs,
  COUNT(DISTINCT wl.id) AS total_leagues
FROM world_provinces wp
JOIN countries c ON c.id = wp.country_id
LEFT JOIN world_clubs wc ON wc.province_id = wp.id
LEFT JOIN world_leagues wl ON wl.province_id = wp.id
GROUP BY wp.id, c.id;

COMMENT ON VIEW public.world_province_stats IS 'Aggregated stats for World directory province cards';

COMMIT;
