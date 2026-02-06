-- Fix orphaned world_clubs claims
-- Clubs marked is_claimed=true but with no claimed_profile_id are ghost claims.
-- Reset them to unclaimed.

UPDATE world_clubs
SET is_claimed = false,
    claimed_at = NULL
WHERE is_claimed = true
  AND claimed_profile_id IS NULL;
