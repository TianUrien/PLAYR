-- Migration: Add application notification preferences for clubs
-- Clubs can opt out of receiving email notifications when players apply to their opportunities

SET search_path = public;

-- Add notify_applications column (defaults to TRUE so existing clubs receive emails)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_applications BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_applications IS 'Whether the club wants to receive email notifications when players apply to their opportunities. Only applies to clubs.';

-- Create index for efficient filtering in notification queries
CREATE INDEX IF NOT EXISTS idx_profiles_notify_applications 
ON public.profiles (notify_applications) 
WHERE role = 'club' AND onboarding_completed = true;
