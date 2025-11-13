-- ============================================
-- FIX: Allow Coaches to Apply to Vacancies
-- ============================================
-- Issue: Coaches getting 403 Forbidden when applying
-- Cause: RLS policy only allows role='player' to insert applications
-- Solution: Allow both players and coaches based on vacancy type

-- Step 1: Drop the old restrictive policy
DROP POLICY IF EXISTS "Players can create applications" ON public.vacancy_applications;

-- Step 2: Create new flexible policy
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

-- Step 3: Verify the policy was created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'vacancy_applications' 
AND policyname = 'Users can create applications matching their role';

-- Done! Coaches should now be able to apply to coach vacancies.
