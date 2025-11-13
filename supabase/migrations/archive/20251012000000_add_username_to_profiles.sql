-- Add username field to profiles for clean public URLs
-- Players: /players/:username
-- Clubs: /clubs/:username (slug)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username text;

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique 
  ON public.profiles(LOWER(username));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username 
  ON public.profiles(username);

-- Add constraint to ensure username format (alphanumeric, hyphen, underscore, 3-30 chars)
ALTER TABLE public.profiles
ADD CONSTRAINT username_format CHECK (
  username IS NULL OR 
  username ~ '^[a-zA-Z0-9_-]{3,30}$'
);

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.username IS 'Unique username for public profile URLs. Format: 3-30 alphanumeric characters, hyphens, or underscores.';
