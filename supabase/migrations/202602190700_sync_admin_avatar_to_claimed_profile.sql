-- =============================================================================
-- Sync admin-uploaded avatar to claimed profile
--
-- Problem: When an admin uploads a club image via Hockey World for an
-- already-claimed club, the image only updates world_clubs.avatar_url.
-- The club's profiles.avatar_url stays NULL, so the web app shows no image.
--
-- Fix:
--   1. Trigger on world_clubs: when avatar_url changes on a claimed club,
--      copy to profiles.avatar_url if the profile has no avatar yet.
--   2. Backfill: for clubs already in this state (claimed + admin image +
--      no profile avatar), copy now.
--
-- Safety: both trigger and backfill check profiles.avatar_url IS NULL,
-- so they never overwrite a club owner's own uploaded image.
-- =============================================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION sync_world_club_avatar_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when avatar_url is set/changed on a claimed club
  IF NEW.avatar_url IS NOT NULL
     AND NEW.is_claimed = true
     AND NEW.claimed_profile_id IS NOT NULL
     AND (OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
  THEN
    UPDATE profiles
    SET avatar_url = NEW.avatar_url
    WHERE id = NEW.claimed_profile_id
      AND avatar_url IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Attach trigger
DROP TRIGGER IF EXISTS trg_sync_world_club_avatar ON world_clubs;

CREATE TRIGGER trg_sync_world_club_avatar
  AFTER UPDATE OF avatar_url ON world_clubs
  FOR EACH ROW
  EXECUTE FUNCTION sync_world_club_avatar_to_profile();

-- 3. Backfill: fix existing claimed clubs with admin image but no profile avatar
UPDATE profiles p
SET avatar_url = wc.avatar_url
FROM world_clubs wc
WHERE wc.claimed_profile_id = p.id
  AND wc.is_claimed = true
  AND wc.avatar_url IS NOT NULL
  AND p.avatar_url IS NULL;
