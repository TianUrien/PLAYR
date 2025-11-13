-- ================================================================
-- AUDIT UNVERIFIED USERS
-- ================================================================
-- This script lists all users who have not yet verified their email
-- Run this in Supabase SQL Editor to check for unverified accounts
-- ================================================================

-- Count unverified users
SELECT COUNT(*) as unverified_count
FROM auth.users
WHERE email_confirmed_at IS NULL;

-- List all unverified users with details
SELECT 
  id,
  email,
  created_at,
  last_sign_in_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_since_signup,
  raw_user_meta_data->>'role' as intended_role
FROM auth.users
WHERE email_confirmed_at IS NULL
ORDER BY created_at DESC;

-- Check if these users have profiles (from DB trigger)
SELECT 
  u.id,
  u.email,
  u.created_at as auth_created,
  p.created_at as profile_created,
  p.role,
  p.full_name,
  CASE 
    WHEN p.id IS NULL THEN 'No profile'
    WHEN p.full_name IS NULL THEN 'Profile incomplete'
    ELSE 'Profile complete'
  END as profile_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;

-- Find users who signed up but never verified (older than 24 hours)
SELECT 
  id,
  email,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as hours_since_signup
FROM auth.users
WHERE 
  email_confirmed_at IS NULL
  AND created_at < NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- ================================================================
-- OPTIONAL: Manually verify a specific user (if needed)
-- ================================================================
-- Replace 'user-uuid-here' with actual user ID
-- Run only if you need to manually verify a legitimate user

-- UPDATE auth.users 
-- SET email_confirmed_at = NOW() 
-- WHERE id = 'user-uuid-here';

-- ================================================================
-- OPTIONAL: Bulk verify all existing unverified users (one-time migration)
-- ================================================================
-- Use this ONLY if you're migrating from non-verified to verified system
-- This will verify ALL unverified users at once

-- UPDATE auth.users 
-- SET email_confirmed_at = NOW() 
-- WHERE email_confirmed_at IS NULL;

-- ================================================================
-- OPTIONAL: Clean up old unverified accounts (30+ days old)
-- ================================================================
-- This deletes unverified users who signed up over 30 days ago
-- CASCADE will also delete their profiles if they exist

-- DELETE FROM auth.users
-- WHERE 
--   email_confirmed_at IS NULL 
--   AND created_at < NOW() - INTERVAL '30 days';
