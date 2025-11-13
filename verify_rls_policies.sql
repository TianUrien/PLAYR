-- ============================================
-- VERIFY: Check Current RLS Policies
-- ============================================
-- This will show you what policies are currently active

-- Check all policies on vacancy_applications table
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'INSERT' THEN 'INSERT (who can create applications)'
    WHEN cmd = 'SELECT' THEN 'SELECT (who can view applications)'
    WHEN cmd = 'UPDATE' THEN 'UPDATE (who can modify applications)'
    ELSE cmd
  END as policy_type,
  qual as using_clause,
  with_check as with_check_clause
FROM pg_policies 
WHERE tablename = 'vacancy_applications'
ORDER BY cmd, policyname;

-- Check if the correct INSERT policy exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'vacancy_applications' 
      AND policyname = 'Users can create applications matching their role'
      AND cmd = 'INSERT'
    ) THEN '✅ CORRECT POLICY IS ACTIVE'
    ELSE '❌ OLD POLICY STILL ACTIVE'
  END as policy_status;
