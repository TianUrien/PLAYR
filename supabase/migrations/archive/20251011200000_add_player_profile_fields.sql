-- Add new profile fields for players
-- Add passport_1 (required for players)
ALTER TABLE profiles
ADD COLUMN passport_1 TEXT;

-- Add passport_2 (optional)
ALTER TABLE profiles
ADD COLUMN passport_2 TEXT;

-- Add current_club (optional)
ALTER TABLE profiles
ADD COLUMN current_club TEXT;
