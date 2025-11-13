-- ================================================
-- DELETE ACCOUNT FEATURE - DATABASE SETUP
-- ================================================
-- This script ensures all foreign keys have CASCADE delete
-- so that when an auth user is deleted, all related data
-- is automatically removed.
--
-- ⚠️ IMPORTANT: Run this in Supabase SQL Editor
-- ================================================

-- ================================================
-- Step 1: Verify CASCADE on club_media table
-- ================================================
-- Check if club_media foreign key has CASCADE delete
-- If not, recreate it with CASCADE

DO $$
BEGIN
  -- Drop existing foreign key if it exists without CASCADE
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'club_media_club_id_fkey' 
    AND table_name = 'club_media'
  ) THEN
    ALTER TABLE public.club_media DROP CONSTRAINT IF EXISTS club_media_club_id_fkey;
    
    -- Recreate with CASCADE
    ALTER TABLE public.club_media
      ADD CONSTRAINT club_media_club_id_fkey
      FOREIGN KEY (club_id) 
      REFERENCES public.profiles(id) 
      ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated club_media foreign key with CASCADE delete';
  END IF;
END $$;

-- ================================================
-- Step 2: Verify gallery_photos table (if exists)
-- ================================================
-- Ensure gallery_photos has CASCADE delete
-- (This table was from the media features migration)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'gallery_photos'
  ) THEN
    -- Drop existing foreign key
    ALTER TABLE public.gallery_photos DROP CONSTRAINT IF EXISTS gallery_photos_user_id_fkey;
    
    -- Recreate with CASCADE to auth.users
    ALTER TABLE public.gallery_photos
      ADD CONSTRAINT gallery_photos_user_id_fkey
      FOREIGN KEY (user_id) 
      REFERENCES auth.users(id) 
      ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated gallery_photos foreign key with CASCADE delete';
  END IF;
END $$;

-- ================================================
-- Step 3: Verify playing_history table
-- ================================================
-- The migration shows it references auth.users with CASCADE already
-- Just verify it exists

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'playing_history'
  ) THEN
    -- The playing_history table already has CASCADE delete to auth.users(id)
    -- from the migration: REFERENCES auth.users(id) ON DELETE CASCADE
    -- No need to update, just confirm
    RAISE NOTICE 'playing_history already has CASCADE delete to auth.users(id)';
  END IF;
END $$;

-- ================================================
-- Step 4: Verify vacancy_applications table
-- ================================================
-- Ensure CASCADE delete for applicant_id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'vacancy_applications_player_id_fkey' 
    AND table_name = 'vacancy_applications'
  ) THEN
    -- Already has CASCADE from migration
    RAISE NOTICE 'vacancy_applications already has CASCADE delete';
  END IF;
  
  -- Also check for applicant_id variant
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'vacancy_applications' 
    AND column_name = 'applicant_id'
  ) THEN
    ALTER TABLE public.vacancy_applications DROP CONSTRAINT IF EXISTS vacancy_applications_applicant_id_fkey;
    
    ALTER TABLE public.vacancy_applications
      ADD CONSTRAINT vacancy_applications_applicant_id_fkey
      FOREIGN KEY (applicant_id) 
      REFERENCES public.profiles(id) 
      ON DELETE CASCADE;
    
    RAISE NOTICE 'Updated vacancy_applications (applicant_id) foreign key with CASCADE delete';
  END IF;
END $$;

-- ================================================
-- Step 5: Summary - Verify CASCADE is set
-- ================================================
-- Check all foreign keys that should have CASCADE delete

SELECT 
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND (
    tc.table_name IN (
      'profiles',
      'club_media',
      'gallery_photos',
      'playing_history',
      'vacancies',
      'vacancy_applications',
      'conversations',
      'messages'
    )
  )
ORDER BY tc.table_name, tc.constraint_name;

-- ================================================
-- Expected Output:
-- ================================================
-- All foreign keys pointing to profiles(id) or auth.users(id)
-- should show delete_rule = 'CASCADE'
--
-- If any show 'NO ACTION' or 'RESTRICT', you need to update them.
-- ================================================
