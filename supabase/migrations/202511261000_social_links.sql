-- Migration: Add social media links to profiles
-- Description: Allows players, coaches, and clubs to add clickable social media links

SET search_path = public;

-- ============================================================================
-- Add social_links column to profiles
-- ============================================================================
-- Using JSONB for flexibility - stores an object with platform keys and URL values
-- Example: {"instagram": "https://instagram.com/player", "linkedin": "https://linkedin.com/in/player"}

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Add a comment for documentation
COMMENT ON COLUMN public.profiles.social_links IS 'Social media links as JSON object. Keys: instagram, tiktok, linkedin, twitter, facebook. Values: full URLs.';

-- ============================================================================
-- Validation function for social links
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_social_links(links JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'];
  link_key TEXT;
  link_value TEXT;
BEGIN
  -- Allow null or empty object
  IF links IS NULL OR links = '{}'::jsonb THEN
    RETURN TRUE;
  END IF;
  
  -- Must be an object, not an array
  IF jsonb_typeof(links) != 'object' THEN
    RETURN FALSE;
  END IF;
  
  -- Check each key-value pair
  FOR link_key, link_value IN SELECT * FROM jsonb_each_text(links) LOOP
    -- Key must be in allowed list
    IF NOT (link_key = ANY(allowed_keys)) THEN
      RETURN FALSE;
    END IF;
    
    -- Value must be a string (URL) and not empty when present
    IF link_value IS NOT NULL AND length(trim(link_value)) > 0 THEN
      -- Basic URL validation - must start with http:// or https://
      IF NOT (link_value ~* '^https?://') THEN
        RETURN FALSE;
      END IF;
      
      -- URL length limit
      IF length(link_value) > 500 THEN
        RETURN FALSE;
      END IF;
    END IF;
  END LOOP;
  
  RETURN TRUE;
END;
$$;

-- ============================================================================
-- Add check constraint
-- ============================================================================
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_social_links_valid
CHECK (public.validate_social_links(social_links));

-- ============================================================================
-- Create index for queries that might filter by social links presence
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_has_social_links
ON public.profiles ((social_links IS NOT NULL AND social_links != '{}'::jsonb))
WHERE social_links IS NOT NULL AND social_links != '{}'::jsonb;
