-- =============================================================================
-- Bidirectional avatar sync between profiles and world_clubs
--
-- Previous migrations solved World → Profile (admin upload syncs to profile).
-- This migration adds Profile → World:
--   1. claim_world_club(): also copy profile avatar → world if world has none
--   2. Trigger on profiles: when a claimed club updates their avatar,
--      sync it to world_clubs so Admin Hockey World stays in sync
--   3. Backfill: claimed clubs where profile has avatar but world doesn't
-- =============================================================================

-- 1. Update claim_world_club: bidirectional avatar fill on claim
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
  v_profile_avatar TEXT;
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

  -- Get the profile's current avatar for reverse sync
  SELECT avatar_url INTO v_profile_avatar FROM profiles WHERE id = p_profile_id;

  -- Get league names for profile update
  SELECT name INTO v_men_league_name FROM world_leagues WHERE id = p_men_league_id;
  SELECT name INTO v_women_league_name FROM world_leagues WHERE id = p_women_league_id;

  -- Claim the club + copy profile avatar to world if world has none
  UPDATE world_clubs
  SET
    is_claimed = true,
    claimed_profile_id = p_profile_id,
    claimed_at = timezone('utc', now()),
    men_league_id = p_men_league_id,
    women_league_id = p_women_league_id,
    avatar_url = CASE
      WHEN avatar_url IS NULL AND v_profile_avatar IS NOT NULL THEN v_profile_avatar
      ELSE avatar_url
    END
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

-- 2. Trigger: sync profile avatar changes to world_clubs for claimed clubs
CREATE OR REPLACE FUNCTION sync_profile_avatar_to_world_club()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when avatar_url actually changed
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url AND NEW.avatar_url IS NOT NULL THEN
    UPDATE world_clubs
    SET avatar_url = NEW.avatar_url
    WHERE claimed_profile_id = NEW.id
      AND is_claimed = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_avatar_to_world ON profiles;

CREATE TRIGGER trg_sync_profile_avatar_to_world
  AFTER UPDATE OF avatar_url ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_avatar_to_world_club();

-- 3. Backfill: claimed clubs where profile has avatar but world_clubs doesn't
UPDATE world_clubs wc
SET avatar_url = p.avatar_url
FROM profiles p
WHERE wc.claimed_profile_id = p.id
  AND wc.is_claimed = true
  AND p.avatar_url IS NOT NULL
  AND wc.avatar_url IS NULL;
