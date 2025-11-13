-- Fix profiles table for 2-step signup flow
-- Remove NOT NULL constraints to allow partial profiles
-- Profile creation will be handled by the app code after email verification

-- Step 1: Make fields optional (except id, email, role)
ALTER TABLE public.profiles 
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN base_location DROP NOT NULL,
  ALTER COLUMN nationality DROP NOT NULL;

-- Step 2: Ensure proper permissions for profile creation
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;

-- Step 3: Make sure the INSERT policy allows creating profiles
-- This is for when CompleteProfile page creates the profile after verification
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Step 4: Ensure service_role can also insert (for migrations/admin)
GRANT ALL ON public.profiles TO service_role;

-- NOTE: No trigger on auth.users (permission denied by Supabase)
-- Instead, CompleteProfile page will create the profile on-the-fly if it doesn't exist

