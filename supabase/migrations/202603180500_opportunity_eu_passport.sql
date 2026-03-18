-- ============================================================================
-- Add EU Passport Required field to opportunities
-- ============================================================================
-- Clubs commonly require players to have EU citizenship/passport.
-- This is a critical real-world recruitment filter in field hockey.
-- ============================================================================

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS eu_passport_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.opportunities.eu_passport_required IS
  'Whether the opportunity requires the applicant to hold an EU passport or European citizenship.';

-- Update the public view to include the new column (preserve existing structure)
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
  p.current_club AS publisher_current_club,
  wc.club_name AS world_club_name,
  wc.avatar_url AS world_club_avatar_url,
  COALESCE(ml.name, wl.name) AS world_club_league,
  v.eu_passport_required
FROM public.opportunities v
INNER JOIN public.profiles p ON p.id = v.club_id
LEFT JOIN public.world_clubs wc ON wc.id = v.world_club_id
LEFT JOIN public.world_leagues ml ON ml.id = wc.men_league_id
LEFT JOIN public.world_leagues wl ON wl.id = wc.women_league_id
WHERE v.status = 'open'
  AND COALESCE(p.is_test_account, false) = false
  AND p.onboarding_completed = true;

GRANT SELECT ON public.public_opportunities TO anon, authenticated;
ALTER VIEW public.public_opportunities SET (security_invoker = true);
