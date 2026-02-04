-- ============================================================================
-- Enable coaches to create and publish opportunities (parity with clubs)
--
-- Changes:
--   A) Update RLS on opportunities: allow role IN ('club', 'coach')
--   B) Update public_opportunities view: add publisher_role column
--   C) Widen notify_applications index to include coaches
--   D) Rename application-related policies for clarity
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- A) RLS: Allow coaches to manage their own opportunities
-- ============================================================================

DROP POLICY IF EXISTS "Clubs can manage their opportunities" ON public.opportunities;

CREATE POLICY "Publishers can manage their opportunities"
  ON public.opportunities
  FOR ALL
  USING (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') IN ('club', 'coach')
  )
  WITH CHECK (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') IN ('club', 'coach')
  );

-- ============================================================================
-- B) Update public_opportunities view: expose publisher_role
-- ============================================================================

CREATE OR REPLACE VIEW public.public_opportunities AS
SELECT
  v.id,
  v.title,
  v.opportunity_type,
  v.position,
  v.gender,
  v.description,
  v.location_city,
  v.location_country,
  v.start_date,
  v.duration_text,
  v.application_deadline,
  v.priority,
  v.requirements,
  v.benefits,
  v.custom_benefits,
  v.published_at,
  v.created_at,
  p.full_name      AS club_name,
  p.avatar_url     AS club_logo_url,
  p.base_location  AS club_location,
  p.league_division AS club_league,
  p.role           AS publisher_role
FROM public.opportunities v
INNER JOIN public.profiles p ON p.id = v.club_id
WHERE
  v.status = 'open'
  AND COALESCE(p.is_test_account, false) = false
  AND p.onboarding_completed = true;

GRANT SELECT ON public.public_opportunities TO anon, authenticated;

-- ============================================================================
-- C) Widen notify_applications index to include coaches
-- ============================================================================

DROP INDEX IF EXISTS idx_profiles_notify_applications;
CREATE INDEX idx_profiles_notify_applications
  ON public.profiles (notify_applications)
  WHERE role IN ('club', 'coach') AND onboarding_completed = true;

-- ============================================================================
-- D) Rename application-related policies for clarity
--    (No functional change — the USING/WITH CHECK clauses are identical)
-- ============================================================================

-- SELECT policy
DROP POLICY IF EXISTS "Clubs can view applications to their opportunities"
  ON public.opportunity_applications;

CREATE POLICY "Publishers can view applications to their opportunities"
  ON public.opportunity_applications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_applications.opportunity_id
        AND o.club_id = auth.uid()
    )
  );

-- UPDATE policy
DROP POLICY IF EXISTS "Clubs can update application status"
  ON public.opportunity_applications;

CREATE POLICY "Publishers can update application status"
  ON public.opportunity_applications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_applications.opportunity_id
        AND o.club_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = opportunity_applications.opportunity_id
        AND o.club_id = auth.uid()
    )
  );
