-- Adds explicit visibility control for contact emails across all profile types
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS contact_email_public BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.contact_email_public IS 'Whether the profile owner consents to showing an email publicly.';

COMMIT;
