-- Migration: Add complete Club profile fields
-- Add league_division, website, contact_email, club_bio, club_history

ALTER TABLE profiles 
ADD COLUMN league_division TEXT,
ADD COLUMN website TEXT,
ADD COLUMN contact_email TEXT,
ADD COLUMN club_bio TEXT,
ADD COLUMN club_history TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.league_division IS 'Club league or division (e.g., National League, Premier Division)';
COMMENT ON COLUMN profiles.website IS 'Club website URL';
COMMENT ON COLUMN profiles.contact_email IS 'Club contact email (may differ from login email)';
COMMENT ON COLUMN profiles.club_bio IS 'Club description/bio';
COMMENT ON COLUMN profiles.club_history IS 'Club establishment history and background';
