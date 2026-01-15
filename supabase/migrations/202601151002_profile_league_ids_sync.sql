-- Profile League IDs + World Sync (Argentina Phase 1)
-- Adds structured league ID fields to profiles and syncs to world_clubs

BEGIN;

-- ============================================================================
-- STEP 1: Add league ID columns to profiles
-- ============================================================================
-- These store the canonical league reference (FK to world_leagues)
-- The existing text fields (mens_league_division, womens_league_division) remain for:
--   1) Backward compatibility
--   2) Countries not yet in World directory
--   3) Display purposes (denormalized name)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mens_league_id INT REFERENCES public.world_leagues(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS womens_league_id INT REFERENCES public.world_leagues(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS world_region_id INT REFERENCES public.world_provinces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_mens_league ON public.profiles(mens_league_id) WHERE mens_league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_womens_league ON public.profiles(womens_league_id) WHERE womens_league_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_world_region ON public.profiles(world_region_id) WHERE world_region_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.mens_league_id IS 'FK to world_leagues for men''s team (Argentina Phase 1+)';
COMMENT ON COLUMN public.profiles.womens_league_id IS 'FK to world_leagues for women''s team (Argentina Phase 1+)';
COMMENT ON COLUMN public.profiles.world_region_id IS 'FK to world_provinces (region) where club is based';

-- ============================================================================
-- STEP 2: Create sync trigger - profiles → world_clubs
-- ============================================================================
-- When a club profile updates its league IDs, sync to world_clubs
-- This ensures World directory always reflects profile's league selection

CREATE OR REPLACE FUNCTION public.sync_profile_leagues_to_world()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only process if league IDs changed
  IF (OLD.mens_league_id IS DISTINCT FROM NEW.mens_league_id)
     OR (OLD.womens_league_id IS DISTINCT FROM NEW.womens_league_id) THEN
    
    -- Update world_clubs where this profile is the claimer
    UPDATE world_clubs
    SET 
      men_league_id = NEW.mens_league_id,
      women_league_id = NEW.womens_league_id,
      -- Also update province if region changed
      province_id = COALESCE(NEW.world_region_id, province_id)
    WHERE claimed_profile_id = NEW.id;
    
    -- Also sync the text fields for display (denormalized)
    NEW.mens_league_division := (SELECT name FROM world_leagues WHERE id = NEW.mens_league_id);
    NEW.womens_league_division := (SELECT name FROM world_leagues WHERE id = NEW.womens_league_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_leagues_to_world_trigger ON public.profiles;
CREATE TRIGGER sync_profile_leagues_to_world_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role = 'club')
  EXECUTE FUNCTION public.sync_profile_leagues_to_world();

COMMENT ON FUNCTION public.sync_profile_leagues_to_world IS 'Syncs profile league IDs to world_clubs when club profile is updated';

-- ============================================================================
-- STEP 3: Backfill existing claimed clubs
-- ============================================================================
-- For clubs already claimed, populate the new profile columns from world_clubs

UPDATE profiles p
SET 
  mens_league_id = wc.men_league_id,
  womens_league_id = wc.women_league_id,
  world_region_id = wc.province_id
FROM world_clubs wc
WHERE wc.claimed_profile_id = p.id
  AND wc.is_claimed = true
  AND p.role = 'club';

-- ============================================================================
-- STEP 4: Update claim functions to also set profile league IDs
-- ============================================================================

-- Update claim_world_club to set profile league IDs
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
  v_province_id INT;
BEGIN
  -- Check if club exists and is not already claimed
  SELECT * INTO v_club FROM world_clubs WHERE id = p_world_club_id FOR UPDATE;
  
  IF v_club IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Club not found');
  END IF;
  
  IF v_club.is_claimed THEN
    RETURN json_build_object('success', false, 'error', 'Club has already been claimed');
  END IF;
  
  v_province_id := v_club.province_id;
  
  -- Claim the club
  UPDATE world_clubs
  SET 
    is_claimed = true,
    claimed_profile_id = p_profile_id,
    claimed_at = timezone('utc', now()),
    men_league_id = COALESCE(p_men_league_id, men_league_id),
    women_league_id = COALESCE(p_women_league_id, women_league_id)
  WHERE id = p_world_club_id;
  
  -- Update the profile with league IDs AND text names
  UPDATE profiles
  SET 
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = v_province_id,
    mens_league_division = (SELECT name FROM world_leagues WHERE id = p_men_league_id),
    womens_league_division = (SELECT name FROM world_leagues WHERE id = p_women_league_id)
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', p_world_club_id);
END;
$$;

-- Update create_and_claim_world_club similarly
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
  
  -- Update the profile with league IDs AND text names
  UPDATE profiles
  SET 
    mens_league_id = p_men_league_id,
    womens_league_id = p_women_league_id,
    world_region_id = p_province_id,
    mens_league_division = (SELECT name FROM world_leagues WHERE id = p_men_league_id),
    womens_league_division = (SELECT name FROM world_leagues WHERE id = p_women_league_id)
  WHERE id = p_profile_id;
  
  RETURN json_build_object('success', true, 'club_id', v_new_id, 'created', true);
END;
$$;

COMMIT;
