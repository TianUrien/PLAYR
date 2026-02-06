-- Auto-unclaim world clubs when claimed_profile_id is nullified.
-- This handles the case where a club profile is deleted (FK ON DELETE SET NULL)
-- or manually unlinked — ensuring is_claimed always stays in sync.

CREATE OR REPLACE FUNCTION public.world_clubs_auto_unclaim()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.claimed_profile_id IS NULL AND OLD.claimed_profile_id IS NOT NULL THEN
    NEW.is_claimed := false;
    NEW.claimed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS world_clubs_auto_unclaim_trigger ON public.world_clubs;
CREATE TRIGGER world_clubs_auto_unclaim_trigger
  BEFORE UPDATE ON public.world_clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.world_clubs_auto_unclaim();
