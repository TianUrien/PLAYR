-- =====================================================================
-- COACH PROFILE PICTURE UPLOAD - COMPREHENSIVE DIAGNOSTIC & FIX
-- =====================================================================
-- Run this script to diagnose and fix all issues preventing avatar uploads
-- =====================================================================

-- STEP 1: Check if avatars storage bucket exists
-- =====================================================================
SELECT 
  id,
  name,
  public,
  created_at
FROM storage.buckets 
WHERE id = 'avatars';

-- Expected: 1 row with id='avatars', public=true
-- If NO rows: The bucket doesn't exist (PROBLEM!)


-- STEP 2: Check storage policies for avatars bucket
-- =====================================================================
SELECT 
  policyname,
  cmd,
  qual
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects';

-- Expected: Policies for SELECT, INSERT, UPDATE, DELETE on avatars bucket
-- If MISSING: Policies aren't set up (PROBLEM!)


-- STEP 3: Check profiles table has avatar_url column
-- =====================================================================
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'profiles' 
AND column_name IN ('avatar_url', 'bio');

-- Expected: 
--   avatar_url | text | YES
--   bio        | text | YES
-- If MISSING: Columns don't exist (PROBLEM!)


-- STEP 4: Check your profile data
-- =====================================================================
SELECT 
  id,
  email,
  full_name,
  role,
  avatar_url,
  base_location,
  nationality
FROM public.profiles
WHERE email = 'tianurien@hotmail.com';

-- Expected: role = 'coach' (not 'player')
-- Note: bio column checked separately in STEP 3


-- STEP 5: Check RLS (Row Level Security) policies on profiles table
-- =====================================================================
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

-- Expected: Policies allowing authenticated users to UPDATE their own profile


-- =====================================================================
-- FIXES - Run these if anything is missing above
-- =====================================================================

-- FIX 1: Create avatars bucket if it doesn't exist
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;


-- FIX 2: Add bio column if it doesn't exist
-- =====================================================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;


-- FIX 3: Set up storage policies for avatars bucket
-- =====================================================================

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own avatars" ON storage.objects;

-- Allow public read access to avatars
CREATE POLICY "Public avatar access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload avatars
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own avatars
CREATE POLICY "Authenticated users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own avatars
CREATE POLICY "Authenticated users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);


-- FIX 4: Update your profile role to 'coach'
-- =====================================================================
UPDATE public.profiles 
SET role = 'coach'
WHERE email = 'tianurien@hotmail.com'
AND role != 'coach';


-- FIX 5: Ensure profiles table has proper RLS policies
-- =====================================================================

-- Enable RLS if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policy first (if it exists)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);


-- =====================================================================
-- VERIFICATION - Run these to confirm everything works
-- =====================================================================

-- Verify 1: Check bucket exists and is public
SELECT 
  id,
  name,
  public,
  CASE 
    WHEN public = true THEN '✅ Public access enabled'
    ELSE '❌ Not public - PROBLEM!'
  END as status
FROM storage.buckets 
WHERE id = 'avatars';


-- Verify 2: Check bio column exists
SELECT 
  CASE 
    WHEN COUNT(*) > 0 THEN '✅ bio column exists'
    ELSE '❌ bio column missing - PROBLEM!'
  END as status
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'profiles' 
AND column_name = 'bio';


-- Verify 3: Check your profile is coach role
SELECT 
  full_name,
  email,
  role,
  CASE 
    WHEN role = 'coach' THEN '✅ Role is coach'
    ELSE '❌ Role is ' || role || ' - Should be coach!'
  END as status
FROM public.profiles
WHERE email = 'tianurien@hotmail.com';


-- Verify 4: Count storage policies
SELECT 
  COUNT(*) as policy_count,
  CASE 
    WHEN COUNT(*) >= 4 THEN '✅ Storage policies exist'
    ELSE '❌ Missing storage policies - Need 4, have ' || COUNT(*)
  END as status
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%avatar%';


-- =====================================================================
-- EXPECTED OUTPUT AFTER RUNNING ALL FIXES:
-- =====================================================================
-- Verify 1: ✅ Public access enabled
-- Verify 2: ✅ bio column exists
-- Verify 3: ✅ Role is coach
-- Verify 4: ✅ Storage policies exist
-- =====================================================================
