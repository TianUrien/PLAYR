-- ============================================================================
-- Migration: Require Opportunity to be Open for Applications
-- ============================================================================
-- Problem: Users can apply to closed opportunities via direct API calls.
-- The current RLS policy validates role matching but not opportunity status.
--
-- Fix: Add check that opportunity.status = 'open' before allowing application.
-- ============================================================================

-- Drop the existing policy
DROP POLICY IF EXISTS "Applicants can create applications" ON public.opportunity_applications;

-- Recreate with status check
CREATE POLICY "Applicants can create applications"
  ON public.opportunity_applications
  FOR INSERT
  WITH CHECK (
    -- User must be the applicant
    auth.uid() = applicant_id
    -- AND the opportunity must be open AND role must match
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.opportunities o ON o.id = opportunity_id
      WHERE p.id = auth.uid()
      -- Opportunity must be open for applications
      AND o.status = 'open'
      AND (
        -- Player applying to player opportunity
        (p.role = 'player' AND o.opportunity_type = 'player')
        OR
        -- Coach applying to coach opportunity
        (p.role = 'coach' AND o.opportunity_type = 'coach')
      )
    )
  );

COMMENT ON POLICY "Applicants can create applications" ON public.opportunity_applications IS
  'Users can only apply to OPEN opportunities where their role matches the opportunity type. Prevents applications to closed/draft opportunities.';
