-- Fix coach profile that was incorrectly set to 'player' role
-- Run this SQL in your Supabase SQL Editor

-- Update the profile for tianurien@hotmail.com to have role='coach'
UPDATE public.profiles 
SET role = 'coach'
WHERE email = 'tianurien@hotmail.com'
AND role = 'player';

-- Verify the update
SELECT id, email, full_name, role, base_location, nationality
FROM public.profiles
WHERE email = 'tianurien@hotmail.com';
