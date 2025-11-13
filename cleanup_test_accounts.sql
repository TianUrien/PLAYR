-- ================================================================
-- CLEANUP TEST ACCOUNTS
-- ================================================================
-- Use this to investigate and reset stuck test accounts
-- that can't sign up or receive verification emails
-- ================================================================

-- ================================================================
-- STEP 1: INVESTIGATE THE ACCOUNTS
-- ================================================================

-- Check if the accounts exist and their verification status
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  last_sign_in_at,
  confirmation_sent_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_since_signup,
  raw_user_meta_data->>'role' as intended_role,
  CASE 
    WHEN email_confirmed_at IS NOT NULL THEN 'Verified'
    WHEN confirmation_sent_at IS NOT NULL THEN 'Unverified (email sent)'
    ELSE 'Unverified (no email sent)'
  END as status
FROM auth.users
WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com')
ORDER BY created_at DESC;

-- Check if these accounts have profiles
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  p.created_at as profile_created,
  p.role,
  p.full_name,
  p.first_name,
  p.last_name,
  CASE 
    WHEN p.id IS NULL THEN 'No profile'
    WHEN p.full_name IS NULL THEN 'Profile incomplete (basic only)'
    ELSE 'Profile complete'
  END as profile_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email IN ('valturienzo@gmail.com', 'tian@kykuyo.com')
ORDER BY u.created_at DESC;

-- ================================================================
-- STEP 2: UNDERSTAND THE ISSUE
-- ================================================================
-- Common scenarios:
-- 
-- 1. UNVERIFIED ACCOUNTS (email_confirmed_at = NULL)
--    - Sign-up completed but email not clicked
--    - Supabase prevents re-signup with same email
--    - Solution: Delete the unverified account
--
-- 2. VERIFIED BUT INCOMPLETE PROFILES
--    - Email verified but profile form not completed
--    - User may have closed browser during profile setup
--    - Solution: Either complete profile or delete account
--
-- 3. VERIFIED AND COMPLETE
--    - Account is fully set up
--    - Can't "re-signup" - use password reset instead
--    - Solution: Use "Forgot Password" flow or delete account
--
-- 4. RATE LIMITED
--    - Too many verification emails sent
--    - Supabase blocks further emails temporarily
--    - Solution: Wait 60+ minutes or delete and recreate
-- ================================================================

-- ================================================================
-- STEP 3: CLEAN UP TEST ACCOUNTS
-- ================================================================
-- This will permanently delete the accounts and all associated data
-- CASCADE will also delete:
--   - profiles (public.profiles)
--   - playing_history
--   - media items
--   - vacancy_applications
--   - conversations and messages

-- OPTION A: Delete specific test accounts
DELETE FROM auth.users
WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com');

-- OPTION B: Delete only UNVERIFIED test accounts (safer)
-- Uncomment if you only want to delete unverified ones:
-- DELETE FROM auth.users
-- WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com')
--   AND email_confirmed_at IS NULL;

-- ================================================================
-- STEP 4: VERIFY CLEANUP
-- ================================================================
-- Run this after deletion to confirm accounts are gone
SELECT COUNT(*) as remaining_test_accounts
FROM auth.users
WHERE email IN ('valturienzo@gmail.com', 'tian@kykuyo.com');

-- Should return: remaining_test_accounts = 0

-- ================================================================
-- PREVENTION TIPS FOR FUTURE TESTING
-- ================================================================
-- 1. Use disposable email services for testing:
--    - https://temp-mail.org
--    - https://10minutemail.com
--    - https://guerrillamail.com
--
-- 2. Use email aliases (Gmail):
--    - valturienzo+test1@gmail.com
--    - valturienzo+test2@gmail.com
--    - All go to same inbox, but Supabase treats as different
--
-- 3. Clean up immediately after testing:
--    - Run the DELETE query after each test session
--    - Don't leave accounts in unverified state
--
-- 4. Use Supabase local development:
--    - `supabase start` for local testing
--    - No email verification in local mode
--    - No rate limiting concerns
--
-- 5. Check rate limits:
--    - Supabase allows ~3-4 verification emails per hour per email
--    - Wait 60 minutes between resend attempts
--    - Or use different email addresses
-- ================================================================
