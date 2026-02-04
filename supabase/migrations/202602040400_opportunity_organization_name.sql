-- Add organization_name to opportunities so coaches (and clubs) can specify
-- which organisation the opportunity is for. For coaches this might be their
-- current club, an academy, a camp, etc.  Pre-existing rows get NULL which
-- the frontend treats as "fall back to the publisher's current_club".

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS organization_name TEXT;

-- Update the public view to expose both organization_name and the publisher's
-- current_club (as a fallback when organization_name is NULL).
-- NOTE: new columns MUST be appended at the end to avoid
-- "cannot change name of view column" errors with CREATE OR REPLACE VIEW.
CREATE OR REPLACE VIEW public.public_opportunities AS
SELECT
  v.id, v.title, v.opportunity_type, v.position, v.gender,
  v.description, v.location_city, v.location_country,
  v.start_date, v.duration_text, v.application_deadline,
  v.priority, v.requirements, v.benefits, v.custom_benefits,
  v.published_at, v.created_at,
  p.full_name  AS club_name,
  p.avatar_url AS club_logo_url,
  p.base_location AS club_location,
  p.league_division AS club_league,
  p.role AS publisher_role,
  v.organization_name,
  p.current_club AS publisher_current_club
FROM public.opportunities v
INNER JOIN public.profiles p ON p.id = v.club_id
WHERE v.status = 'open'
  AND COALESCE(p.is_test_account, false) = false
  AND p.onboarding_completed = true;

GRANT SELECT ON public.public_opportunities TO anon, authenticated;
