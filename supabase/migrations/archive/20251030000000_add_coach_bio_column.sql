-- Add bio column for coaches
-- This allows coaches to have a personal biography field separate from club_bio

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.bio IS 'Personal biography for players and coaches';

-- Note: club_bio remains for clubs, bio is for players/coaches
