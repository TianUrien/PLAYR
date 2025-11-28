-- =====================================================
-- E2E Test Account Setup Script
-- =====================================================
-- This script creates dedicated accounts for automated E2E testing.
-- These are SEPARATE from manual Gmail test accounts.
--
-- Run this script in Supabase SQL Editor to set up the test users.
-- Password for all accounts: Hola1234
-- =====================================================

-- Helper function to create a test user with profile
-- Uses Supabase's auth.users table directly (requires service role)

DO $$
DECLARE
  player_id UUID;
  club_id UUID;
  coach_id UUID;
  hashed_password TEXT;
BEGIN
  -- Generate the password hash for 'Hola1234'
  -- Supabase uses bcrypt for password hashing
  hashed_password := crypt('Hola1234', gen_salt('bf'));

  -- =====================================================
  -- 1. E2E Test Player
  -- =====================================================
  
  -- Check if user already exists
  SELECT id INTO player_id FROM auth.users WHERE email = 'e2e-player@playr.test';
  
  IF player_id IS NULL THEN
    -- Generate new UUID
    player_id := gen_random_uuid();
    
    -- Create auth user
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      player_id,
      '00000000-0000-0000-0000-000000000000',
      'e2e-player@playr.test',
      hashed_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
      FALSE,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );
    
    RAISE NOTICE 'Created E2E Player auth user: %', player_id;
  ELSE
    -- Update password if user exists
    UPDATE auth.users 
    SET encrypted_password = hashed_password,
        updated_at = NOW()
    WHERE id = player_id;
    RAISE NOTICE 'Updated E2E Player password: %', player_id;
  END IF;
  
  -- Create or update profile
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    username,
    base_location,
    nationality,
    position,
    secondary_position,
    gender,
    date_of_birth,
    bio,
    onboarding_completed,
    is_test_account,
    created_at,
    updated_at
  ) VALUES (
    player_id,
    'e2e-player@playr.test',
    'player',
    'E2E Test Player',
    'e2e-test-player',
    'London, UK',
    'United Kingdom',
    'midfielder',
    'forward',
    'Men',
    '1995-05-15',
    'E2E test player account for automated testing',
    TRUE,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_test_account = TRUE,
    onboarding_completed = TRUE,
    updated_at = NOW();

  -- =====================================================
  -- 2. E2E Test Club
  -- =====================================================
  
  SELECT id INTO club_id FROM auth.users WHERE email = 'e2e-club@playr.test';
  
  IF club_id IS NULL THEN
    club_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      club_id,
      '00000000-0000-0000-0000-000000000000',
      'e2e-club@playr.test',
      hashed_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
      FALSE,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );
    
    RAISE NOTICE 'Created E2E Club auth user: %', club_id;
  ELSE
    UPDATE auth.users 
    SET encrypted_password = hashed_password,
        updated_at = NOW()
    WHERE id = club_id;
    RAISE NOTICE 'Updated E2E Club password: %', club_id;
  END IF;
  
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    username,
    base_location,
    nationality,
    club_bio,
    league_division,
    contact_email,
    year_founded,
    onboarding_completed,
    is_test_account,
    created_at,
    updated_at
  ) VALUES (
    club_id,
    'e2e-club@playr.test',
    'club',
    'E2E Test FC',
    'e2e-test-fc',
    'Manchester, UK',
    'United Kingdom',
    'E2E test club account for automated testing',
    'Division 1',
    'contact@e2e-test-fc.playr.test',
    2020,
    TRUE,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_test_account = TRUE,
    onboarding_completed = TRUE,
    updated_at = NOW();

  -- =====================================================
  -- 3. E2E Test Coach
  -- =====================================================
  
  SELECT id INTO coach_id FROM auth.users WHERE email = 'e2e-coach@playr.test';
  
  IF coach_id IS NULL THEN
    coach_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      coach_id,
      '00000000-0000-0000-0000-000000000000',
      'e2e-coach@playr.test',
      hashed_password,
      NOW(),
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
      FALSE,
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );
    
    RAISE NOTICE 'Created E2E Coach auth user: %', coach_id;
  ELSE
    UPDATE auth.users 
    SET encrypted_password = hashed_password,
        updated_at = NOW()
    WHERE id = coach_id;
    RAISE NOTICE 'Updated E2E Coach password: %', coach_id;
  END IF;
  
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    username,
    base_location,
    nationality,
    bio,
    position,
    onboarding_completed,
    is_test_account,
    created_at,
    updated_at
  ) VALUES (
    coach_id,
    'e2e-coach@playr.test',
    'coach',
    'E2E Test Coach',
    'e2e-test-coach',
    'Birmingham, UK',
    'United Kingdom',
    'E2E test coach account for automated testing',
    'Head Coach',
    TRUE,
    TRUE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    is_test_account = TRUE,
    onboarding_completed = TRUE,
    updated_at = NOW();

  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'E2E Test Accounts Created/Updated Successfully!';
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'Player: e2e-player@playr.test (ID: %)', player_id;
  RAISE NOTICE 'Club: e2e-club@playr.test (ID: %)', club_id;
  RAISE NOTICE 'Coach: e2e-coach@playr.test (ID: %)', coach_id;
  RAISE NOTICE 'Password for all: Hola1234';
  RAISE NOTICE '=====================================================';

END $$;
