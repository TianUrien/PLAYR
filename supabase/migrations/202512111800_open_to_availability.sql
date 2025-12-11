-- Migration: Add availability status fields for players and coaches
-- Players can set "Open to Play", Coaches can set "Open to Coach"
-- These flags indicate availability for new opportunities

-- Add the availability columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS open_to_play BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS open_to_coach BOOLEAN NOT NULL DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.open_to_play IS 'Players only: indicates availability for new playing opportunities';
COMMENT ON COLUMN public.profiles.open_to_coach IS 'Coaches only: indicates availability for new coaching opportunities';

-- Create an index for efficient filtering in Community page
CREATE INDEX IF NOT EXISTS idx_profiles_open_to_play 
ON public.profiles (open_to_play) 
WHERE open_to_play = true AND role = 'player' AND onboarding_completed = true;

CREATE INDEX IF NOT EXISTS idx_profiles_open_to_coach 
ON public.profiles (open_to_coach) 
WHERE open_to_coach = true AND role = 'coach' AND onboarding_completed = true;

-- Add a check constraint to ensure consistency:
-- - Players can only have open_to_play = true (not open_to_coach)
-- - Coaches can only have open_to_coach = true (not open_to_play)
-- - Clubs cannot have either set to true
-- Note: We use a soft constraint via trigger rather than CHECK to allow flexibility

CREATE OR REPLACE FUNCTION public.enforce_availability_consistency()
RETURNS TRIGGER AS $$
BEGIN
  -- For players: ensure open_to_coach is always false
  IF NEW.role = 'player' THEN
    NEW.open_to_coach := false;
  END IF;
  
  -- For coaches: ensure open_to_play is always false
  IF NEW.role = 'coach' THEN
    NEW.open_to_play := false;
  END IF;
  
  -- For clubs: ensure both are always false
  IF NEW.role = 'club' THEN
    NEW.open_to_play := false;
    NEW.open_to_coach := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce consistency on insert/update
DROP TRIGGER IF EXISTS enforce_availability_consistency_trigger ON public.profiles;
CREATE TRIGGER enforce_availability_consistency_trigger
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_availability_consistency();
