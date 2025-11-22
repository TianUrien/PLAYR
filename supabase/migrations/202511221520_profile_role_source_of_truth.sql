SET search_path = public;

BEGIN;

-- ---------------------------------------------------------------------------
-- Canonical role lookup helper (returns NULL if no profile row exists)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_profile_role IS 'Returns the role stored on profiles for the current auth.uid().';
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Clubs may only manage vacancies when their profile role is club
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clubs can manage their vacancies" ON public.vacancies;
CREATE POLICY "Clubs can manage their vacancies"
  ON public.vacancies
  FOR ALL
  USING (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  )
  WITH CHECK (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  );

-- ---------------------------------------------------------------------------
-- Applicants must have a player or coach role stored on profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Applicants can create applications" ON public.vacancy_applications;
CREATE POLICY "Applicants can create applications"
  ON public.vacancy_applications
  FOR INSERT
  WITH CHECK (
    auth.uid() = player_id
    AND COALESCE(public.current_profile_role(), '') IN ('player', 'coach')
  );

-- ---------------------------------------------------------------------------
-- Players and coaches can manage their own gallery photos
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their gallery photos" ON public.gallery_photos;
CREATE POLICY "Users can manage their gallery photos"
  ON public.gallery_photos
  FOR ALL
  USING (
    auth.uid() = user_id
    AND COALESCE(public.current_profile_role(), '') IN ('player', 'coach')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(public.current_profile_role(), '') IN ('player', 'coach')
  );

-- ---------------------------------------------------------------------------
-- Players and coaches can manage their playing history
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage their playing history" ON public.playing_history;
CREATE POLICY "Users can manage their playing history"
  ON public.playing_history
  FOR ALL
  USING (
    auth.uid() = user_id
    AND COALESCE(public.current_profile_role(), '') IN ('player', 'coach')
  )
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(public.current_profile_role(), '') IN ('player', 'coach')
  );

-- ---------------------------------------------------------------------------
-- Clubs can manage their media when the profile role is club
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clubs can manage their media" ON public.club_media;
CREATE POLICY "Clubs can manage their media"
  ON public.club_media
  FOR ALL
  USING (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  )
  WITH CHECK (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  );

COMMIT;
