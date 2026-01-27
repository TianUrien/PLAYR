-- ============================================================================
-- Migration: Fix Opportunity Type Validation in Applications
--
-- Problem: Players can apply to coach opportunities and vice versa.
-- The current RLS policy only checks if the user is a player OR coach,
-- but doesn't validate that the opportunity_type matches the user's role.
--
-- Fix: Add validation that:
--   - Players can only apply to opportunities where opportunity_type = 'player'
--   - Coaches can only apply to opportunities where opportunity_type = 'coach'
-- ============================================================================

-- Drop the existing permissive policy
DROP POLICY IF EXISTS "Applicants can create applications" ON public.vacancy_applications;

-- Create the corrected policy with opportunity_type validation
CREATE POLICY "Applicants can create applications"
  ON public.vacancy_applications
  FOR INSERT
  WITH CHECK (
    -- User must be the applicant
    auth.uid() = player_id
    -- AND the user's role must match the opportunity's target type
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.vacancies v ON v.id = vacancy_id
      WHERE p.id = auth.uid()
      AND (
        -- Player applying to player opportunity
        (p.role = 'player' AND v.opportunity_type = 'player')
        OR
        -- Coach applying to coach opportunity
        (p.role = 'coach' AND v.opportunity_type = 'coach')
      )
    )
  );

-- Add a helpful comment explaining the policy
COMMENT ON POLICY "Applicants can create applications" ON public.vacancy_applications IS
  'Players can only apply to player opportunities, coaches can only apply to coach opportunities. Validates role-to-opportunity-type matching.';
