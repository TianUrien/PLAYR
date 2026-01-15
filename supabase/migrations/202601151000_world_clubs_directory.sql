-- World Clubs Directory Schema (Phase 1: Argentina)
-- This migration creates the foundation for the global clubs directory
-- with province-first navigation for Argentina

BEGIN;

-- ============================================================================
-- STEP 1: Create world_provinces table
-- ============================================================================
-- Stores provinces/regions within countries for navigation hierarchy
CREATE TABLE IF NOT EXISTS public.world_provinces (
  id SERIAL PRIMARY KEY,
  country_id INT NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,  -- URL-friendly: "buenos-aires"
  description TEXT,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(country_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_world_provinces_country ON public.world_provinces(country_id);
CREATE INDEX IF NOT EXISTS idx_world_provinces_slug ON public.world_provinces(slug);

COMMENT ON TABLE public.world_provinces IS 'Provinces/regions within countries for World directory navigation';

-- ============================================================================
-- STEP 2: Create world_leagues table
-- ============================================================================
-- Stores league options per province (same list used for men and women)
CREATE TABLE IF NOT EXISTS public.world_leagues (
  id SERIAL PRIMARY KEY,
  province_id INT NOT NULL REFERENCES public.world_provinces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tier INT,  -- 1=premier, 2=second, 3=third, etc.
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(province_id, name)
);

CREATE INDEX IF NOT EXISTS idx_world_leagues_province ON public.world_leagues(province_id);

COMMENT ON TABLE public.world_leagues IS 'League options per province (shared for men and women teams)';

-- ============================================================================
-- STEP 3: Create world_clubs table
-- ============================================================================
-- The main directory of seeded and claimed clubs
CREATE TABLE IF NOT EXISTS public.world_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id TEXT NOT NULL,  -- Stable external ID from seed (e.g., "casi_ar_ba")
  club_name TEXT NOT NULL,
  club_name_normalized TEXT NOT NULL,  -- lowercase, trimmed for search
  country_id INT NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  province_id INT REFERENCES public.world_provinces(id) ON DELETE SET NULL,
  men_league_id INT REFERENCES public.world_leagues(id) ON DELETE SET NULL,
  women_league_id INT REFERENCES public.world_leagues(id) ON DELETE SET NULL,
  is_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_from TEXT NOT NULL DEFAULT 'seed' CHECK (created_from IN ('seed', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE(club_id),
  UNIQUE(club_name_normalized, country_id)
);

CREATE INDEX IF NOT EXISTS idx_world_clubs_country ON public.world_clubs(country_id);
CREATE INDEX IF NOT EXISTS idx_world_clubs_province ON public.world_clubs(province_id);
CREATE INDEX IF NOT EXISTS idx_world_clubs_claimed ON public.world_clubs(is_claimed);
CREATE INDEX IF NOT EXISTS idx_world_clubs_claimed_profile ON public.world_clubs(claimed_profile_id) WHERE claimed_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_world_clubs_name_search ON public.world_clubs(club_name_normalized text_pattern_ops);

COMMENT ON TABLE public.world_clubs IS 'World directory of clubs - seeded and user-created, claimed and unclaimed';

-- ============================================================================
-- STEP 4: Updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_world_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS world_provinces_updated_at ON public.world_provinces;
CREATE TRIGGER world_provinces_updated_at
  BEFORE UPDATE ON public.world_provinces
  FOR EACH ROW EXECUTE FUNCTION public.set_world_updated_at();

DROP TRIGGER IF EXISTS world_leagues_updated_at ON public.world_leagues;
CREATE TRIGGER world_leagues_updated_at
  BEFORE UPDATE ON public.world_leagues
  FOR EACH ROW EXECUTE FUNCTION public.set_world_updated_at();

DROP TRIGGER IF EXISTS world_clubs_updated_at ON public.world_clubs;
CREATE TRIGGER world_clubs_updated_at
  BEFORE UPDATE ON public.world_clubs
  FOR EACH ROW EXECUTE FUNCTION public.set_world_updated_at();

-- ============================================================================
-- STEP 5: RLS Policies
-- ============================================================================
ALTER TABLE public.world_provinces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.world_clubs ENABLE ROW LEVEL SECURITY;

-- world_provinces: Public read, admin write
DROP POLICY IF EXISTS "Anyone can read provinces" ON public.world_provinces;
CREATE POLICY "Anyone can read provinces" ON public.world_provinces
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage provinces" ON public.world_provinces;
CREATE POLICY "Admins can manage provinces" ON public.world_provinces
  FOR ALL USING (public.is_platform_admin());

-- world_leagues: Public read, admin write
DROP POLICY IF EXISTS "Anyone can read leagues" ON public.world_leagues;
CREATE POLICY "Anyone can read leagues" ON public.world_leagues
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage leagues" ON public.world_leagues;
CREATE POLICY "Admins can manage leagues" ON public.world_leagues
  FOR ALL USING (public.is_platform_admin());

-- world_clubs: Public read, authenticated claim, admin full access
DROP POLICY IF EXISTS "Anyone can read world clubs" ON public.world_clubs;
CREATE POLICY "Anyone can read world clubs" ON public.world_clubs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create world clubs" ON public.world_clubs;
CREATE POLICY "Authenticated users can create world clubs" ON public.world_clubs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Clubs can update their claimed club" ON public.world_clubs;
CREATE POLICY "Clubs can update their claimed club" ON public.world_clubs
  FOR UPDATE USING (
    auth.uid() = claimed_profile_id
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Admins can delete world clubs" ON public.world_clubs;
CREATE POLICY "Admins can delete world clubs" ON public.world_clubs
  FOR DELETE USING (public.is_platform_admin());

-- ============================================================================
-- STEP 6: Claim club function
-- ============================================================================
-- RPC function for claiming a world club during onboarding
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
  v_result JSON;
BEGIN
  -- Check if club exists and is not already claimed
  SELECT * INTO v_club FROM world_clubs WHERE id = p_world_club_id FOR UPDATE;
  
  IF v_club IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Club not found');
  END IF;
  
  IF v_club.is_claimed THEN
    RETURN json_build_object('success', false, 'error', 'Club has already been claimed');
  END IF;
  
  -- Claim the club
  UPDATE world_clubs
  SET 
    is_claimed = true,
    claimed_profile_id = p_profile_id,
    claimed_at = timezone('utc', now()),
    men_league_id = COALESCE(p_men_league_id, men_league_id),
    women_league_id = COALESCE(p_women_league_id, women_league_id)
  WHERE id = p_world_club_id;
  
  -- Update the profile with league info
  UPDATE profiles
  SET 
    mens_league_division = (SELECT name FROM world_leagues WHERE id = p_men_league_id),
    womens_league_division = (SELECT name FROM world_leagues WHERE id = p_women_league_id)
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', p_world_club_id);
END;
$$;

-- ============================================================================
-- STEP 7: Create new world club function (for "My club is not listed")
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_and_claim_world_club(
  p_club_name TEXT,
  p_country_id INT,
  p_province_id INT,
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
    mens_league_division = (SELECT name FROM world_leagues WHERE id = p_men_league_id),
    womens_league_division = (SELECT name FROM world_leagues WHERE id = p_women_league_id)
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', v_new_id, 'created', true);
END;
$$;

-- ============================================================================
-- STEP 8: Helper views for UI
-- ============================================================================
-- View: Province stats (club counts, league counts)
CREATE OR REPLACE VIEW public.world_province_stats AS
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

-- ============================================================================
-- STEP 9: Seed Argentina data
-- ============================================================================
-- Get Argentina country ID
DO $$
DECLARE
  v_argentina_id INT;
  v_ba_id INT;
  v_cordoba_id INT;
  v_mendoza_id INT;
  v_metro_a_id INT;
  v_metro_b_id INT;
  v_metro_c_id INT;
  v_cordoba_league_id INT;
  v_mendoza_league_id INT;
BEGIN
  -- Get Argentina country ID
  SELECT id INTO v_argentina_id FROM countries WHERE code = 'AR';
  
  IF v_argentina_id IS NULL THEN
    RAISE EXCEPTION 'Argentina (AR) not found in countries table';
  END IF;
  
  -- Insert provinces
  INSERT INTO world_provinces (country_id, name, slug, description, display_order)
  VALUES 
    (v_argentina_id, 'Buenos Aires', 'buenos-aires', 'Home to Argentina''s premier hockey leagues', 1),
    (v_argentina_id, 'Córdoba', 'cordoba', 'Historic hockey province in central Argentina', 2),
    (v_argentina_id, 'Mendoza', 'mendoza', 'Growing hockey community in the west', 3)
  ON CONFLICT (country_id, slug) DO NOTHING;
  
  -- Get province IDs
  SELECT id INTO v_ba_id FROM world_provinces WHERE slug = 'buenos-aires' AND country_id = v_argentina_id;
  SELECT id INTO v_cordoba_id FROM world_provinces WHERE slug = 'cordoba' AND country_id = v_argentina_id;
  SELECT id INTO v_mendoza_id FROM world_provinces WHERE slug = 'mendoza' AND country_id = v_argentina_id;
  
  -- Insert Buenos Aires leagues (same list for men and women)
  INSERT INTO world_leagues (province_id, name, tier, display_order)
  VALUES 
    (v_ba_id, 'Torneo Metropolitano A (AHBA)', 1, 1),
    (v_ba_id, 'Torneo Metropolitano B', 2, 2),
    (v_ba_id, 'Torneo Metropolitano C', 3, 3)
  ON CONFLICT (province_id, name) DO NOTHING;
  
  -- Insert Córdoba league (MVP placeholder)
  INSERT INTO world_leagues (province_id, name, tier, display_order)
  VALUES 
    (v_cordoba_id, 'Torneo Oficial Córdoba (MVP)', 1, 1)
  ON CONFLICT (province_id, name) DO NOTHING;
  
  -- Insert Mendoza league (MVP placeholder)
  INSERT INTO world_leagues (province_id, name, tier, display_order)
  VALUES 
    (v_mendoza_id, 'Torneo Oficial Mendoza (MVP)', 1, 1)
  ON CONFLICT (province_id, name) DO NOTHING;
  
  -- Get league IDs for seeding clubs
  SELECT id INTO v_metro_a_id FROM world_leagues WHERE name = 'Torneo Metropolitano A (AHBA)' AND province_id = v_ba_id;
  SELECT id INTO v_metro_b_id FROM world_leagues WHERE name = 'Torneo Metropolitano B' AND province_id = v_ba_id;
  SELECT id INTO v_metro_c_id FROM world_leagues WHERE name = 'Torneo Metropolitano C' AND province_id = v_ba_id;
  
  -- Insert seed clubs (CASI and San Fernando)
  -- CASI: Women in Metro C, no men team listed
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES 
    ('casi_ar_ba', 'CASI', 'casi', v_argentina_id, v_ba_id, NULL, v_metro_c_id, false, 'seed')
  ON CONFLICT (club_id) DO NOTHING;
  
  -- San Fernando: Both teams in Metro A
  INSERT INTO world_clubs (club_id, club_name, club_name_normalized, country_id, province_id, men_league_id, women_league_id, is_claimed, created_from)
  VALUES 
    ('sanfer_ar_ba', 'San Fernando', 'san fernando', v_argentina_id, v_ba_id, v_metro_a_id, v_metro_a_id, false, 'seed')
  ON CONFLICT (club_id) DO NOTHING;
  
  RAISE NOTICE 'Argentina seed data inserted successfully';
END;
$$;

COMMIT;
