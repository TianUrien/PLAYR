-- ============================================================================
-- TEST ACCOUNT INFRASTRUCTURE
-- ============================================================================
-- Adds support for test accounts that are invisible to real users but can
-- see all real content. Test vacancies (created by test clubs) are also
-- hidden from real users automatically.
-- ============================================================================

-- Add is_test_account column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_test_account
ON public.profiles (is_test_account)
WHERE is_test_account = true;

-- ============================================================================
-- HELPER FUNCTION: Check if current user is a test account
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_current_user_test_account()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_test_account FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ============================================================================
-- HELPER FUNCTION: Check if a vacancy is a test vacancy
-- (A vacancy is a test vacancy if its club is a test account)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_test_vacancy(vacancy_club_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_test_account FROM public.profiles WHERE id = vacancy_club_id),
    false
  );
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON COLUMN public.profiles.is_test_account IS 
  'Marks this profile as a test account. Test accounts are invisible to real users but can see all content.';

COMMENT ON FUNCTION public.is_current_user_test_account() IS 
  'Returns true if the current authenticated user is a test account.';

COMMENT ON FUNCTION public.is_test_vacancy(UUID) IS 
  'Returns true if the vacancy belongs to a test club account.';
