-- Fix RLS policy to allow coaches to apply to vacancies
-- Current issue: Only players can create applications, coaches get 403 Forbidden
-- Solution: Allow both players and coaches to apply based on vacancy opportunity_type

-- Drop the restrictive policy
DROP POLICY IF EXISTS "Players can create applications" ON public.vacancy_applications;

-- Create new policy that allows both players and coaches to apply
CREATE POLICY "Users can create applications matching their role"
  ON public.vacancy_applications
  FOR INSERT
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.vacancies v ON v.id = vacancy_applications.vacancy_id
      WHERE p.id = auth.uid()
      AND (
        -- Players can apply to player opportunities
        (p.role = 'player' AND v.opportunity_type = 'player')
        OR
        -- Coaches can apply to coach opportunities
        (p.role = 'coach' AND v.opportunity_type = 'coach')
      )
    )
  );

-- Update the SELECT policy for coaches to view their own applications
-- The existing policy only checks player_id, but we renamed it to applicant_id conceptually
-- Keep using player_id column name for now (it holds both player and coach IDs)

COMMENT ON POLICY "Users can create applications matching their role" ON public.vacancy_applications IS 
  'Allows players to apply to player vacancies and coaches to apply to coach vacancies';

