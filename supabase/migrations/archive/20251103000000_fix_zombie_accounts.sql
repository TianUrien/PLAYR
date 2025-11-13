-- PHASE 1 CRITICAL FIX: Automatic Profile Creation
-- This migration creates a webhook-callable function and enables automatic profile creation

-- ============================================================================
-- STEP 1: Create function for automatic profile creation
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(
  user_id UUID,
  user_email TEXT,
  user_role TEXT DEFAULT 'player'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_profile public.profiles;
BEGIN
  -- Insert basic profile with NULL values for fields completed later
  -- Use ON CONFLICT to make this idempotent (safe to call multiple times)
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    base_location,
    nationality
  )
  VALUES (
    user_id,
    user_email,
    user_role,
    NULL,  -- Will be filled in CompleteProfile
    NULL,  -- Will be filled in CompleteProfile
    NULL   -- Will be filled in CompleteProfile
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW()
  RETURNING * INTO new_profile;
  
  -- Log success
  RAISE NOTICE 'Profile created/updated for user %', user_id;
  
  RETURN new_profile;
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, TEXT) TO authenticated, service_role, anon;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_profile_for_new_user IS 
'Creates a basic profile for a new user. Called by webhook after email verification or by app code as fallback. Idempotent - safe to call multiple times.';

-- ============================================================================
-- STEP 2: Create atomic profile completion function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_user_profile(
  p_user_id UUID,
  p_full_name TEXT,
  p_base_location TEXT,
  p_nationality TEXT,
  p_position TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_passport_1 TEXT DEFAULT NULL,
  p_passport_2 TEXT DEFAULT NULL,
  p_year_founded INTEGER DEFAULT NULL,
  p_league_division TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_club_bio TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_role TEXT;
BEGIN
  -- Get current profile to determine role
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- If profile doesn't exist, this will fail - which is correct
  -- Profile should be created by create_profile_for_new_user first
  
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %. Please sign out and sign in again.', p_user_id;
  END IF;
  
  -- Update profile with complete data
  -- Only update fields that are provided (NOT NULL)
  UPDATE public.profiles
  SET 
    full_name = p_full_name,
    base_location = p_base_location,
    nationality = p_nationality,
    position = COALESCE(p_position, position),
    gender = COALESCE(p_gender, gender),
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    passport_1 = COALESCE(p_passport_1, passport_1),
    passport_2 = COALESCE(p_passport_2, passport_2),
    year_founded = COALESCE(p_year_founded, year_founded),
    league_division = COALESCE(p_league_division, league_division),
    website = COALESCE(p_website, website),
    contact_email = COALESCE(p_contact_email, contact_email),
    club_bio = COALESCE(p_club_bio, club_bio),
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;
  
  -- Log success
  RAISE NOTICE 'Profile completed for user %', p_user_id;
  
  RETURN v_profile;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.complete_user_profile TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.complete_user_profile IS 
'Completes a user profile with full details. Profile must already exist (created by create_profile_for_new_user). Transaction-safe and atomic.';

-- ============================================================================
-- STEP 3: Create helper function to find zombie accounts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.find_zombie_accounts()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  email_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  intended_role TEXT,
  profile_exists BOOLEAN,
  profile_complete BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id as user_id,
    au.email::TEXT,
    au.email_confirmed_at,
    au.created_at,
    (au.raw_user_meta_data->>'role')::TEXT as intended_role,
    (p.id IS NOT NULL) as profile_exists,
    (p.full_name IS NOT NULL) as profile_complete
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE au.email_confirmed_at IS NOT NULL  -- Email verified
    AND (
      p.id IS NULL                          -- No profile (zombie type 1)
      OR p.full_name IS NULL                -- Incomplete profile (zombie type 2)
    )
  ORDER BY au.created_at DESC;
END;
$$;

-- Grant execute to service_role only (admin function)
GRANT EXECUTE ON FUNCTION public.find_zombie_accounts TO service_role;

-- Add comment
COMMENT ON FUNCTION public.find_zombie_accounts IS 
'Admin function to find zombie accounts (verified email but missing/incomplete profile). For monitoring and recovery.';

-- ============================================================================
-- STEP 4: Create recovery function for existing zombie accounts
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recover_zombie_accounts()
RETURNS TABLE (
  user_id UUID,
  action_taken TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  zombie_record RECORD;
  created_profile public.profiles;
BEGIN
  -- Loop through all zombies and create missing profiles
  FOR zombie_record IN 
    SELECT 
      au.id,
      au.email,
      COALESCE((au.raw_user_meta_data->>'role')::TEXT, 'player') as role
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.email_confirmed_at IS NOT NULL
      AND p.id IS NULL
  LOOP
    -- Create profile for this zombie
    BEGIN
      created_profile := public.create_profile_for_new_user(
        zombie_record.id,
        zombie_record.email,
        zombie_record.role
      );
      
      -- Return success
      user_id := zombie_record.id;
      action_taken := 'Profile created';
      RETURN NEXT;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with next zombie
      user_id := zombie_record.id;
      action_taken := 'ERROR: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- Grant execute to service_role only (admin function)
GRANT EXECUTE ON FUNCTION public.recover_zombie_accounts TO service_role;

-- Add comment
COMMENT ON FUNCTION public.recover_zombie_accounts IS 
'Admin function to automatically recover all existing zombie accounts by creating missing profiles. Run once after deploying this migration.';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check that functions were created successfully
DO $$
BEGIN
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Profile creation functions deployed successfully!';
  RAISE NOTICE '==============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created functions:';
  RAISE NOTICE '  1. create_profile_for_new_user() - Auto profile creation';
  RAISE NOTICE '  2. complete_user_profile() - Atomic profile completion';
  RAISE NOTICE '  3. find_zombie_accounts() - Monitoring';
  RAISE NOTICE '  4. recover_zombie_accounts() - Bulk recovery';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run: SELECT * FROM find_zombie_accounts();';
  RAISE NOTICE '  2. Run: SELECT * FROM recover_zombie_accounts();';
  RAISE NOTICE '  3. Set up Supabase Auth Webhook (see docs)';
  RAISE NOTICE '  4. Update CompleteProfile.tsx to use RPC functions';
  RAISE NOTICE '';
END;
$$;
