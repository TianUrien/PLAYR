-- Migration: Add notification preferences to profiles
-- Users can opt out of opportunity notification emails

SET search_path = public;

-- Add notify_opportunities column (defaults to TRUE so existing users receive emails)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_opportunities BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_opportunities IS 'Whether the user wants to receive email notifications when new opportunities are published. Only applies to players and coaches.';

-- Create index for efficient filtering in notification queries
CREATE INDEX IF NOT EXISTS idx_profiles_notify_opportunities 
ON public.profiles (notify_opportunities) 
WHERE role IN ('player', 'coach') AND onboarding_completed = true;
