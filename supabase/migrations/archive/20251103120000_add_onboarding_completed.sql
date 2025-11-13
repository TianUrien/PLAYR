-- Add onboarding_completed flag to profiles table
-- This ensures only fully onboarded users appear in public listings (Community page, etc.)

-- Add the column with default false
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false NOT NULL;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON public.profiles(onboarding_completed);

-- Create composite index for community queries (onboarding + created_at)
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_created 
ON public.profiles(onboarding_completed, created_at DESC) 
WHERE onboarding_completed = true;

-- Backfill: Mark profiles as completed if they have required fields filled
-- This handles existing users who completed onboarding before this migration

-- For players: full_name, base_location, nationality, position, gender must be present
UPDATE public.profiles
SET onboarding_completed = true
WHERE role = 'player'
  AND full_name IS NOT NULL 
  AND full_name != ''
  AND base_location IS NOT NULL 
  AND base_location != ''
  AND nationality IS NOT NULL 
  AND nationality != ''
  AND position IS NOT NULL 
  AND position != ''
  AND gender IS NOT NULL 
  AND gender != ''
  AND onboarding_completed = false;

-- For coaches: full_name, base_location, nationality, gender must be present
UPDATE public.profiles
SET onboarding_completed = true
WHERE role = 'coach'
  AND full_name IS NOT NULL 
  AND full_name != ''
  AND base_location IS NOT NULL 
  AND base_location != ''
  AND nationality IS NOT NULL 
  AND nationality != ''
  AND gender IS NOT NULL 
  AND gender != ''
  AND onboarding_completed = false;

-- For clubs: full_name (club name), base_location, nationality must be present
UPDATE public.profiles
SET onboarding_completed = true
WHERE role = 'club'
  AND full_name IS NOT NULL 
  AND full_name != ''
  AND base_location IS NOT NULL 
  AND base_location != ''
  AND nationality IS NOT NULL 
  AND nationality != ''
  AND onboarding_completed = false;

-- Add helpful comment
COMMENT ON COLUMN public.profiles.onboarding_completed IS 
'Indicates whether the user has completed the full onboarding process. Only profiles with this set to true should appear in public listings like the Community page.';
