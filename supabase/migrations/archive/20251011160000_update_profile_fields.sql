-- Migration: Update profile fields for production
-- Add position and gender for players, rename photo columns to avatar_url

-- Add new columns for players
ALTER TABLE profiles 
ADD COLUMN position TEXT,
ADD COLUMN gender TEXT;

-- Add constraint for gender
ALTER TABLE profiles 
ADD CONSTRAINT profiles_gender_check 
CHECK (gender IN ('Men', 'Women'));

-- Rename profile_photo_url to avatar_url
ALTER TABLE profiles 
RENAME COLUMN profile_photo_url TO avatar_url;

-- Drop club_logo_url (we'll use avatar_url for all roles)
ALTER TABLE profiles 
DROP COLUMN IF EXISTS club_logo_url;

-- Drop coaching_focus and certifications (simplified coach profile)
ALTER TABLE profiles 
DROP COLUMN IF EXISTS coaching_focus,
DROP COLUMN IF EXISTS certifications;
