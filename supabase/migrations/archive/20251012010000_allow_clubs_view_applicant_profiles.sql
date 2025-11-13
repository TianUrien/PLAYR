-- Allow clubs to view player profiles for applicants
-- This enables clubs to see basic player information when viewing vacancy applications

CREATE POLICY "Clubs can view applicant player profiles"
  ON public.profiles
  FOR SELECT
  USING (
    role = 'player'
    AND EXISTS (
      SELECT 1 FROM public.vacancy_applications va
      JOIN public.vacancies v ON v.id = va.vacancy_id
      WHERE va.player_id = profiles.id
      AND v.club_id = auth.uid()
    )
  );
