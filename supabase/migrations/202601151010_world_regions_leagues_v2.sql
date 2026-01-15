-- World Regions & Leagues V2 Migration
-- This migration refactors the world structure to support:
-- 1. Countries with and without regions
-- 2. Multi-country expansion (Argentina, Australia, England, Italy, Germany)
-- 3. England as separate country entry (not GB/UK)
-- 4. Gender-independent league dropdowns

BEGIN;

-- ============================================================================
-- STEP 1: Add England as a country (for World directory - separate from GB)
-- ============================================================================
-- England needs to be a separate entry because hockey structures differ within UK
-- Using XE as code since EN/ENG may conflict with existing entries
-- code_alpha3 uses XEN to avoid conflicts
INSERT INTO public.countries (code, code_alpha3, name, nationality_name, region, flag_emoji)
VALUES ('XE', 'XEN', 'England', 'English', 'Europe', '🏴󠁧󠁢󠁥󠁮󠁧󠁿')
ON CONFLICT (code) DO UPDATE SET 
  name = EXCLUDED.name,
  nationality_name = EXCLUDED.nationality_name,
  flag_emoji = EXCLUDED.flag_emoji;

-- ============================================================================
-- STEP 2: Rename world_provinces → world_regions
-- ============================================================================
-- We keep the table but add columns for flexibility
ALTER TABLE public.world_provinces 
  ADD COLUMN IF NOT EXISTS logical_id TEXT UNIQUE;

-- Update existing data with logical IDs
UPDATE public.world_provinces 
SET logical_id = 'ar_' || slug 
WHERE logical_id IS NULL;

-- ============================================================================
-- STEP 3: Modify world_leagues to support countries without regions
-- ============================================================================
-- Add direct country reference for countries that don't use regions
ALTER TABLE public.world_leagues 
  ADD COLUMN IF NOT EXISTS country_id INT REFERENCES public.countries(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS logical_id TEXT UNIQUE;

-- Make province_id nullable (for countries without regions)
ALTER TABLE public.world_leagues 
  ALTER COLUMN province_id DROP NOT NULL;

-- Make slug nullable for countries without regions (will derive from logical_id)
ALTER TABLE public.world_leagues 
  ALTER COLUMN slug DROP NOT NULL;

-- Drop old unique constraint if exists
ALTER TABLE public.world_leagues 
  DROP CONSTRAINT IF EXISTS world_leagues_province_id_name_key;

-- Add check constraint: must have either province_id or country_id
DO $$
BEGIN
  ALTER TABLE public.world_leagues 
    ADD CONSTRAINT world_leagues_location_check 
    CHECK (province_id IS NOT NULL OR country_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN
  -- Constraint already exists
  NULL;
END;
$$;

-- Add unique constraint on (country_id, name) for region-less countries
CREATE UNIQUE INDEX IF NOT EXISTS idx_world_leagues_country_name 
  ON public.world_leagues(country_id, name) 
  WHERE province_id IS NULL;

-- Create index for tier ordering
CREATE INDEX IF NOT EXISTS idx_world_leagues_tier ON public.world_leagues(tier);

-- ============================================================================
-- STEP 4: Seed Australian regions
-- ============================================================================
DO $$
DECLARE
  v_australia_id INT;
BEGIN
  SELECT id INTO v_australia_id FROM countries WHERE code = 'AU';
  
  IF v_australia_id IS NULL THEN
    RAISE EXCEPTION 'Australia (AU) not found in countries table';
  END IF;
  
  -- Insert Australian regions
  INSERT INTO world_provinces (country_id, name, slug, logical_id, description, display_order)
  VALUES 
    (v_australia_id, 'National', 'national', 'au_nat', 'National level competitions', 1),
    (v_australia_id, 'Western Australia', 'western-australia', 'au_westa', 'Western Australia hockey leagues', 2),
    (v_australia_id, 'Victoria', 'victoria', 'au_vic', 'Victoria hockey leagues', 3)
  ON CONFLICT (country_id, slug) DO UPDATE SET logical_id = EXCLUDED.logical_id;
  
  RAISE NOTICE 'Australian regions seeded successfully';
END;
$$;

-- ============================================================================
-- STEP 5: Seed all leagues from world_hockey_structure
-- ============================================================================
DO $$
DECLARE
  v_argentina_id INT;
  v_australia_id INT;
  v_england_id INT;
  v_italy_id INT;
  v_germany_id INT;
  v_ba_id INT;
  v_au_nat_id INT;
  v_au_westa_id INT;
  v_au_vic_id INT;
BEGIN
  -- Get country IDs
  SELECT id INTO v_argentina_id FROM countries WHERE code = 'AR';
  SELECT id INTO v_australia_id FROM countries WHERE code = 'AU';
  SELECT id INTO v_england_id FROM countries WHERE code = 'XE';
  SELECT id INTO v_italy_id FROM countries WHERE code = 'IT';
  SELECT id INTO v_germany_id FROM countries WHERE code = 'DE';
  
  -- Get region IDs
  SELECT id INTO v_ba_id FROM world_provinces WHERE logical_id = 'ar_ba' OR slug = 'buenos-aires';
  SELECT id INTO v_au_nat_id FROM world_provinces WHERE logical_id = 'au_nat';
  SELECT id INTO v_au_westa_id FROM world_provinces WHERE logical_id = 'au_westa';
  SELECT id INTO v_au_vic_id FROM world_provinces WHERE logical_id = 'au_vic';
  
  -- Update existing Argentina Buenos Aires leagues with logical IDs
  UPDATE world_leagues SET logical_id = 'ar_ba_1', tier = 1 
    WHERE province_id = v_ba_id AND name LIKE 'Torneo Metropolitano A%';
  UPDATE world_leagues SET logical_id = 'ar_ba_2', tier = 2 
    WHERE province_id = v_ba_id AND name = 'Torneo Metropolitano B';
  UPDATE world_leagues SET logical_id = 'ar_ba_3', tier = 3 
    WHERE province_id = v_ba_id AND name = 'Torneo Metropolitano C';
  
  -- Insert Australian leagues (with regions)
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    -- Australia National
    (v_au_nat_id, v_australia_id, 'Hockey One League', 'hockey-one-league', 1, 'au_nat', 1),
    -- Western Australia
    (v_au_westa_id, v_australia_id, 'Premier League', 'premier-league', 1, 'au_westa_1', 1),
    (v_au_westa_id, v_australia_id, 'Premier League 2', 'premier-league-2', 2, 'au_westa_2', 2),
    (v_au_westa_id, v_australia_id, 'Premier League 3', 'premier-league-3', 3, 'au_westa_3', 3),
    -- Victoria
    (v_au_vic_id, v_australia_id, 'Premier League', 'premier-league', 1, 'au_vic_1', 1),
    (v_au_vic_id, v_australia_id, 'Vic League 1', 'vic-league-1', 2, 'au_vic_2', 2),
    (v_au_vic_id, v_australia_id, 'Vic League 2', 'vic-league-2', 3, 'au_vic_3', 3)
  ON CONFLICT (logical_id) DO UPDATE SET 
    name = EXCLUDED.name,
    tier = EXCLUDED.tier;
  
  -- Insert English leagues (NO regions - country_id only)
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_england_id, 'Premier Division', 'premier-division', 1, 'en_1', 1),
    (NULL, v_england_id, 'Division One South', 'division-one-south', 2, 'en_2', 2),
    (NULL, v_england_id, 'Division One North', 'division-one-north', 2, 'en_3', 3)
  ON CONFLICT (logical_id) DO UPDATE SET 
    name = EXCLUDED.name,
    tier = EXCLUDED.tier;
  
  -- Insert Italian leagues (NO regions - country_id only)
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_italy_id, 'Serie A Elite', 'serie-a-elite', 1, 'it_w_1', 1),
    (NULL, v_italy_id, 'Serie A1', 'serie-a1', 2, 'it_w_2', 2),
    (NULL, v_italy_id, 'Serie A2', 'serie-a2', 3, 'it_m_3', 3)
  ON CONFLICT (logical_id) DO UPDATE SET 
    name = EXCLUDED.name,
    tier = EXCLUDED.tier;
  
  -- Insert German leagues (NO regions - country_id only)
  INSERT INTO world_leagues (province_id, country_id, name, slug, tier, logical_id, display_order)
  VALUES
    (NULL, v_germany_id, '1. Bundesliga', '1-bundesliga', 1, 'ger_1', 1),
    (NULL, v_germany_id, '2. Bundesliga', '2-bundesliga', 2, 'ger_2', 2)
  ON CONFLICT (logical_id) DO UPDATE SET 
    name = EXCLUDED.name,
    tier = EXCLUDED.tier;
  
  RAISE NOTICE 'All leagues seeded successfully';
END;
$$;

-- ============================================================================
-- STEP 6: Create world_countries_with_directory view
-- ============================================================================
-- Lists countries that have World directory support (have leagues)
CREATE OR REPLACE VIEW public.world_countries_with_directory AS
SELECT DISTINCT
  c.id AS country_id,
  c.code AS country_code,
  c.name AS country_name,
  c.flag_emoji,
  c.region,
  -- Does this country use regions?
  EXISTS (
    SELECT 1 FROM world_leagues wl 
    WHERE wl.province_id IS NOT NULL 
    AND wl.country_id = c.id
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
-- STEP 7: Create get_leagues_for_country_region function
-- ============================================================================
-- Returns leagues filtered by country + optional region, ordered by tier
CREATE OR REPLACE FUNCTION public.get_leagues_for_location(
  p_country_id INT,
  p_region_id INT DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  name TEXT,
  tier INT,
  logical_id TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_region_id IS NOT NULL THEN
    -- Country with regions: filter by region
    RETURN QUERY
    SELECT wl.id, wl.name, wl.tier, wl.logical_id
    FROM world_leagues wl
    WHERE wl.province_id = p_region_id
    ORDER BY wl.tier ASC NULLS LAST, wl.name ASC;
  ELSE
    -- Country without regions: filter by country directly (where province_id IS NULL)
    RETURN QUERY
    SELECT wl.id, wl.name, wl.tier, wl.logical_id
    FROM world_leagues wl
    WHERE wl.country_id = p_country_id 
      AND wl.province_id IS NULL
    ORDER BY wl.tier ASC NULLS LAST, wl.name ASC;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_leagues_for_location IS 'Returns leagues for a country+region (if applicable), ordered by tier';

-- ============================================================================
-- STEP 8: Update world_province_stats view for backward compatibility
-- ============================================================================
DROP VIEW IF EXISTS public.world_province_stats;
CREATE OR REPLACE VIEW public.world_province_stats AS
SELECT 
  wp.id AS province_id,
  wp.country_id,
  wp.name AS province_name,
  wp.slug,
  wp.logical_id,
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

COMMENT ON VIEW public.world_province_stats IS 'Aggregated stats for World directory region cards';

-- ============================================================================
-- STEP 9: Update claim_world_club to handle the new structure
-- ============================================================================
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
  
  -- Update the profile with league info
  UPDATE profiles
  SET 
    mens_league_division = v_men_league_name,
    womens_league_division = v_women_league_name,
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = v_club.province_id
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', p_world_club_id);
END;
$$;

-- ============================================================================
-- STEP 10: Update create_and_claim_world_club for new structure
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_and_claim_world_club(
  p_club_name TEXT,
  p_country_id INT,
  p_province_id INT,  -- Can be NULL for countries without regions
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
  v_normalized TEXT;
  v_club_id TEXT;
  v_new_id UUID;
  v_existing RECORD;
  v_men_league_name TEXT;
  v_women_league_name TEXT;
BEGIN
  -- Normalize club name
  v_normalized := lower(trim(p_club_name));
  
  -- Check for duplicate
  SELECT * INTO v_existing FROM world_clubs 
  WHERE club_name_normalized = v_normalized AND country_id = p_country_id;
  
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'A club with this name already exists in this country');
  END IF;
  
  -- Generate stable club_id
  v_club_id := replace(v_normalized, ' ', '_') || '_' || p_country_id || '_' || extract(epoch from now())::int;
  
  -- Get league names
  SELECT name INTO v_men_league_name FROM world_leagues WHERE id = p_men_league_id;
  SELECT name INTO v_women_league_name FROM world_leagues WHERE id = p_women_league_id;
  
  -- Create and claim the club
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
  
  -- Update the profile with league info
  UPDATE profiles
  SET 
    mens_league_division = v_men_league_name,
    womens_league_division = v_women_league_name,
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = p_province_id
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', v_new_id, 'created', true);
END;
$$;

COMMIT;
