-- =====================================================================
-- FIXED STORAGE POLICIES FOR AVATARS - More Permissive
-- =====================================================================
-- The original policies might be too restrictive
-- This creates simpler, more permissive policies
-- =====================================================================

-- STEP 1: Drop existing restrictive policies
-- =====================================================================
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;


-- STEP 2: Create new, more permissive policies
-- =====================================================================

-- Allow EVERYONE to view avatars (public read)
CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');


-- Allow ANY authenticated user to upload avatars
-- (No folder/owner restrictions - more permissive)
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');


-- Allow ANY authenticated user to update avatars
-- (No folder/owner restrictions - more permissive)
CREATE POLICY "Authenticated users can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');


-- Allow ANY authenticated user to delete avatars
-- (No folder/owner restrictions - more permissive)
CREATE POLICY "Authenticated users can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');


-- =====================================================================
-- VERIFICATION
-- =====================================================================
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN qual IS NULL THEN 'No restrictions'
    ELSE qual
  END as restrictions
FROM pg_policies 
WHERE schemaname = 'storage' 
AND tablename = 'objects'
AND policyname LIKE '%avatar%'
ORDER BY cmd;

-- Expected output: 4 policies (SELECT, INSERT, UPDATE, DELETE)
-- =====================================================================
