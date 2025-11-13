-- =================================================================
-- COACH PROFILE FIXES - Run this in Supabase SQL Editor
-- =================================================================
-- This script fixes two issues:
-- 1. Updates your existing profile from 'player' to 'coach' role
-- 2. Adds the missing 'bio' column for coaches (fixes avatar upload error)
-- =================================================================

-- STEP 1: Add the bio column (if it doesn't exist)
-- This is required for coaches to save their biography
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

COMMENT ON COLUMN public.profiles.bio IS 'Personal biography for players and coaches';

-- STEP 2: Update your profile role from 'player' to 'coach'
UPDATE public.profiles 
SET role = 'coach'
WHERE email = 'tianurien@hotmail.com'
AND role = 'player';

-- STEP 3: Verify the changes
-- Check 1: Verify the bio column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name = 'bio';

-- Check 2: Verify your profile is now a coach with all fields
SELECT 
  id,
  email, 
  full_name, 
  role,
  base_location,
  nationality,
  avatar_url,
  bio,
  date_of_birth,
  gender,
  passport_1,
  passport_2,
  contact_email,
  created_at
FROM public.profiles
WHERE email = 'tianurien@hotmail.com';

-- =================================================================
-- EXPECTED RESULTS:
-- =================================================================
-- Check 1 should show: bio | text
-- Check 2 should show: role = 'coach' and all your profile data
-- 
-- After running this:
-- ✅ Your profile will be correctly set as 'coach' role
-- ✅ The bio column will exist for storing coach biography
-- ✅ Avatar upload will work without "Failed to update profile" error
-- ✅ You can save all coach-specific fields
-- =================================================================
