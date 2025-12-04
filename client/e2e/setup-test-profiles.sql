-- Setup E2E Test Profiles (DEPRECATED)
-- ⚠️ THIS SCRIPT IS NO LONGER NEEDED
-- 
-- We now use real Gmail test accounts that were manually created:
--   Player: playrplayer93@gmail.com
--   Club:   clubplayr8@gmail.com  
--   Coach:  coachplayr@gmail.com
--   Password for all: Hola1234
--
-- These accounts already exist in Supabase with completed profiles.
-- This script is kept for reference only.

-- Player test account profile
INSERT INTO public.profiles (
  id,
  email,
  role,
  full_name,
  username,
  base_location,
  nationality,
  position,
  secondary_position,
  gender,
  date_of_birth,
  bio,
  onboarding_completed
) VALUES (
  'cf211e83-4fc7-4246-a567-c987737f51cc',
  'playrplayer93@gmail.com',
  'player',
  'E2E Test Player',
  'e2e-test-player',
  'London, UK',
  'United Kingdom',
  'midfielder',
  'forward',
  'Men',
  '1995-05-15',
  'E2E test player account for automated testing',
  true
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  base_location = EXCLUDED.base_location,
  nationality = EXCLUDED.nationality,
  position = EXCLUDED.position,
  secondary_position = EXCLUDED.secondary_position,
  gender = EXCLUDED.gender,
  date_of_birth = EXCLUDED.date_of_birth,
  bio = EXCLUDED.bio,
  onboarding_completed = EXCLUDED.onboarding_completed,
  updated_at = NOW();

-- Club test account profile
INSERT INTO public.profiles (
  id,
  email,
  role,
  full_name,
  username,
  base_location,
  nationality,
  club_bio,
  league_division,
  contact_email,
  year_founded,
  onboarding_completed
) VALUES (
  'b7e77f0c-d28f-419c-89e6-ff69704a9663',
  'clubplayr8@gmail.com',
  'club',
  'E2E Test FC',
  'e2e-test-fc',
  'Manchester, UK',
  'United Kingdom',
  'E2E test club account for automated testing',
  'Division 1',
  'clubplayr8@gmail.com',
  2020,
  true
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  username = EXCLUDED.username,
  base_location = EXCLUDED.base_location,
  nationality = EXCLUDED.nationality,
  club_bio = EXCLUDED.club_bio,
  league_division = EXCLUDED.league_division,
  contact_email = EXCLUDED.contact_email,
  year_founded = EXCLUDED.year_founded,
  onboarding_completed = EXCLUDED.onboarding_completed,
  updated_at = NOW();

-- Verify the profiles were created/updated
SELECT id, email, role, full_name, onboarding_completed FROM public.profiles 
WHERE email IN ('playrplayer93@gmail.com', 'clubplayr8@gmail.com', 'coachplayr@gmail.com');
