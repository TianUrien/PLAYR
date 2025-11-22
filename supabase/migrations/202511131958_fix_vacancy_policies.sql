-- 202511131958_fix_vacancy_policies.sql
-- Adjust vacancy-related policies to eliminate recursion via profiles lookups.

SET search_path = public;

-- Ensure clubs are authorized via profile role rather than JWT metadata
DROP POLICY IF EXISTS "Clubs can manage their vacancies" ON public.vacancies;
CREATE POLICY "Clubs can manage their vacancies"
  ON public.vacancies
  FOR ALL
  USING (
    auth.uid() = club_id
    AND coalesce(public.current_profile_role(), '') = 'club'
  )
  WITH CHECK (
    auth.uid() = club_id
    AND coalesce(public.current_profile_role(), '') = 'club'
  );

-- Permit applicants based on canonical profile role instead of JWT metadata
DROP POLICY IF EXISTS "Applicants can create applications" ON public.vacancy_applications;
CREATE POLICY "Applicants can create applications"
  ON public.vacancy_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = player_id
    AND coalesce(public.current_profile_role(), '') IN ('player', 'coach')
  );
