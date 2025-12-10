-- Lock down profile helper RPCs so only the signed-in owner (or service role) can call them
BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, TEXT) FROM anon;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user(
  user_id UUID,
  user_email TEXT,
  user_role TEXT DEFAULT 'player'
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_role TEXT := auth.role();
  requester_id UUID := auth.uid();
  new_profile public.profiles;
BEGIN
  IF requester_role <> 'service_role' THEN
    IF requester_id IS NULL THEN
      RAISE EXCEPTION 'create_profile_for_new_user requires authentication' USING ERRCODE = '42501';
    END IF;

    IF requester_id <> user_id THEN
      RAISE EXCEPTION 'Cannot create or update profile % as user %', user_id, requester_id USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    base_location,
    nationality,
    username,
    onboarding_completed
  )
  VALUES (
    user_id,
    user_email,
    user_role,
    NULL,
    NULL,
    NULL,
    NULL,
    FALSE
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      role = EXCLUDED.role,
      updated_at = timezone('utc', now())
  RETURNING * INTO new_profile;

  RETURN new_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_profile_for_new_user(UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_user_profile(
  p_user_id UUID,
  p_full_name TEXT,
  p_base_location TEXT,
  p_nationality TEXT,
  p_role TEXT,
  p_position TEXT DEFAULT NULL,
  p_secondary_position TEXT DEFAULT NULL,
  p_gender TEXT DEFAULT NULL,
  p_date_of_birth DATE DEFAULT NULL,
  p_current_club TEXT DEFAULT NULL,
  p_club_history TEXT DEFAULT NULL,
  p_highlight_video_url TEXT DEFAULT NULL,
  p_bio TEXT DEFAULT NULL,
  p_club_bio TEXT DEFAULT NULL,
  p_league_division TEXT DEFAULT NULL,
  p_website TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_year_founded INTEGER DEFAULT NULL,
  p_passport_1 TEXT DEFAULT NULL,
  p_passport_2 TEXT DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_role TEXT := auth.role();
  requester_id UUID := auth.uid();
  updated_profile public.profiles;
BEGIN
  IF requester_role <> 'service_role' THEN
    IF requester_id IS NULL THEN
      RAISE EXCEPTION 'complete_user_profile requires authentication' USING ERRCODE = '42501';
    END IF;

    IF requester_id <> p_user_id THEN
      RAISE EXCEPTION 'Cannot complete profile % as user %', p_user_id, requester_id USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    role = COALESCE(p_role, role),
    full_name = p_full_name,
    base_location = p_base_location,
    nationality = p_nationality,
    position = COALESCE(p_position, position),
    secondary_position = COALESCE(p_secondary_position, secondary_position),
    gender = COALESCE(p_gender, gender),
    date_of_birth = COALESCE(p_date_of_birth, date_of_birth),
    current_club = COALESCE(p_current_club, current_club),
    club_history = COALESCE(p_club_history, club_history),
    highlight_video_url = COALESCE(p_highlight_video_url, highlight_video_url),
    bio = COALESCE(p_bio, bio),
    club_bio = COALESCE(p_club_bio, club_bio),
    league_division = COALESCE(p_league_division, league_division),
    website = COALESCE(p_website, website),
    contact_email = COALESCE(p_contact_email, contact_email),
    year_founded = COALESCE(p_year_founded, year_founded),
    passport_1 = COALESCE(p_passport_1, passport_1),
    passport_2 = COALESCE(p_passport_2, passport_2),
    onboarding_completed = TRUE,
    updated_at = timezone('utc', now())
  WHERE id = p_user_id
  RETURNING * INTO updated_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id;
  END IF;

  RETURN updated_profile;
END;
$$;

-- Use full signature to avoid ambiguity with overloaded functions
GRANT EXECUTE ON FUNCTION public.complete_user_profile(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, TEXT
) TO authenticated;

COMMIT;
