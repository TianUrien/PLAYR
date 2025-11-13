-- Add coach role to the role check constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('player', 'coach', 'club'));

-- Add new fields for Coach role
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coaching_focus TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS certifications TEXT;

-- Add new fields for Club role
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS year_founded INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS club_logo_url TEXT;

-- Rename full_name to accommodate club names
-- (We'll keep full_name but it will be used for club_name when role='club')

-- Add comments for clarity
COMMENT ON COLUMN public.profiles.full_name IS 'Full name for Player/Coach, Club name for Club';
COMMENT ON COLUMN public.profiles.coaching_focus IS 'Coaching focus/level for Coach role';
COMMENT ON COLUMN public.profiles.certifications IS 'Coaching certifications for Coach role';
COMMENT ON COLUMN public.profiles.year_founded IS 'Year founded for Club role';
COMMENT ON COLUMN public.profiles.club_logo_url IS 'Club logo URL for Club role';
