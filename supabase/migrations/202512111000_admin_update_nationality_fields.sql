-- Add nationality country ID fields to admin_update_profile function
-- This allows admins to manually correct nationality data for users

BEGIN;

-- ============================================================================
-- UPDATE admin_update_profile function to include nationality country IDs
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_profile_id UUID,
  p_updates JSONB,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
  v_allowed_fields TEXT[] := ARRAY[
    'full_name', 'username', 'email', 'bio', 'club_bio',
    'nationality', 'nationality_country_id', 'nationality2_country_id',
    'base_location', 'position', 'secondary_position',
    'gender', 'date_of_birth', 'current_club',
    'passport1_country_id', 'passport2_country_id',
    'is_test_account', 'onboarding_completed'
  ];
  v_field TEXT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Validate fields
  FOR v_field IN SELECT jsonb_object_keys(p_updates)
  LOOP
    IF NOT v_field = ANY(v_allowed_fields) THEN
      RAISE EXCEPTION 'Field not allowed for admin update: %', v_field;
    END IF;
  END LOOP;

  -- Get current state
  SELECT to_jsonb(p.*)
  INTO v_old_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  IF v_old_data IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Execute update with all editable fields
  UPDATE profiles
  SET 
    full_name = COALESCE(p_updates ->> 'full_name', full_name),
    username = COALESCE(p_updates ->> 'username', username),
    email = COALESCE(p_updates ->> 'email', email),
    bio = COALESCE(p_updates ->> 'bio', bio),
    club_bio = COALESCE(p_updates ->> 'club_bio', club_bio),
    nationality = COALESCE(p_updates ->> 'nationality', nationality),
    nationality_country_id = COALESCE((p_updates ->> 'nationality_country_id')::INTEGER, nationality_country_id),
    nationality2_country_id = COALESCE((p_updates ->> 'nationality2_country_id')::INTEGER, nationality2_country_id),
    base_location = COALESCE(p_updates ->> 'base_location', base_location),
    position = COALESCE(p_updates ->> 'position', position),
    secondary_position = COALESCE(p_updates ->> 'secondary_position', secondary_position),
    gender = COALESCE(p_updates ->> 'gender', gender),
    date_of_birth = COALESCE((p_updates ->> 'date_of_birth')::DATE, date_of_birth),
    current_club = COALESCE(p_updates ->> 'current_club', current_club),
    passport1_country_id = COALESCE((p_updates ->> 'passport1_country_id')::INTEGER, passport1_country_id),
    passport2_country_id = COALESCE((p_updates ->> 'passport2_country_id')::INTEGER, passport2_country_id),
    is_test_account = COALESCE((p_updates ->> 'is_test_account')::BOOLEAN, is_test_account),
    onboarding_completed = COALESCE((p_updates ->> 'onboarding_completed')::BOOLEAN, onboarding_completed),
    updated_at = now()
  WHERE id = p_profile_id;

  -- Get new state
  SELECT to_jsonb(p.*)
  INTO v_new_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  -- Log the action
  PERFORM public.admin_log_action(
    'update_profile',
    'profile',
    p_profile_id,
    v_old_data,
    v_new_data,
    jsonb_build_object('reason', p_reason, 'fields_updated', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k))
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'updated_fields', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_profile IS 'Updates profile fields with audit logging (includes nationality country IDs)';

-- Grant execute permission to authenticated users (admin check is inside function)
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, JSONB, TEXT) TO authenticated;

COMMIT;
