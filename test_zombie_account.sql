-- Test Script: Create Zombie Account for Testing
-- This simulates a user who verified email but didn't complete profile

-- 1. Find your test user's ID (replace with your actual email)
SELECT id, email, email_confirmed_at 
FROM auth.users 
WHERE email = 'your-test-email@example.com';

-- 2. Set their profile full_name to NULL (creates zombie state)
-- Replace 'USER_ID_HERE' with the actual UUID from step 1
UPDATE profiles 
SET full_name = NULL,
    base_location = NULL,
    nationality = NULL,
    position = NULL,
    gender = NULL
WHERE id = 'USER_ID_HERE';

-- 3. Verify the zombie state was created
SELECT id, email, role, full_name, email_confirmed_at 
FROM profiles 
WHERE id = 'USER_ID_HERE';

-- Expected result:
-- - email_confirmed_at should have a timestamp (verified)
-- - full_name should be NULL (incomplete profile)
-- This is the zombie account state!

-- 4. After testing, restore the profile (optional)
-- UPDATE profiles 
-- SET full_name = 'Test User',
--     base_location = 'Test City',
--     nationality = 'Test Country'
-- WHERE id = 'USER_ID_HERE';
