-- =============================================================================
-- Admin avatar uploads always sync to claimed club profiles
--
-- Problem: The World → Profile sync trigger had an `AND avatar_url IS NULL`
-- guard that prevented admin uploads from propagating when the profile already
-- had any avatar value (including empty string '').
--
-- Product rule: admin uploads via Hockey World should ALWAYS become the club's
-- profile photo. Clubs can also change their own photo (Profile → World trigger
-- already has no guard).
--
-- Fix:
--   1. Remove the IS NULL guard from sync_world_club_avatar_to_profile()
--   2. Backfill: sync world_clubs avatar to profiles for any claimed clubs
--      where the two are currently out of sync
-- =============================================================================

-- 1. Replace trigger function — remove the IS NULL guard
CREATE OR REPLACE FUNCTION sync_world_club_avatar_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sync admin avatar upload to claimed club's profile
  IF NEW.avatar_url IS NOT NULL
     AND NEW.is_claimed = true
     AND NEW.claimed_profile_id IS NOT NULL
     AND (OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
  THEN
    UPDATE profiles
    SET avatar_url = NEW.avatar_url
    WHERE id = NEW.claimed_profile_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Backfill: for claimed clubs where world_clubs has an avatar but profiles
--    either has NULL or a different value, sync the world_clubs avatar
UPDATE profiles p
SET avatar_url = wc.avatar_url
FROM world_clubs wc
WHERE wc.claimed_profile_id = p.id
  AND wc.is_claimed = true
  AND wc.avatar_url IS NOT NULL
  AND (p.avatar_url IS NULL OR p.avatar_url = '' OR p.avatar_url IS DISTINCT FROM wc.avatar_url);
