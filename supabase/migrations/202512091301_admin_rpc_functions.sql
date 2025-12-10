-- ============================================================================
-- ADMIN PORTAL RPC FUNCTIONS
-- ============================================================================
-- Secure RPC functions for admin operations.
-- All functions use SECURITY DEFINER and verify admin status.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- DASHBOARD STATISTICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    -- User metrics
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),
    'blocked_users', (SELECT COUNT(*) FROM profiles WHERE is_blocked = true),
    'test_accounts', (SELECT COUNT(*) FROM profiles WHERE is_test_account = true),
    
    -- Signups
    'signups_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '7 days' AND NOT is_test_account),
    'signups_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '30 days' AND NOT is_test_account),
    
    -- Onboarding
    'onboarding_completed', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = true AND NOT is_test_account),
    'onboarding_pending', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = false AND NOT is_test_account),
    
    -- Content metrics
    'total_vacancies', (SELECT COUNT(*) FROM vacancies),
    'open_vacancies', (SELECT COUNT(*) FROM vacancies WHERE status = 'open'),
    'closed_vacancies', (SELECT COUNT(*) FROM vacancies WHERE status = 'closed'),
    'draft_vacancies', (SELECT COUNT(*) FROM vacancies WHERE status = 'draft'),
    'vacancies_7d', (SELECT COUNT(*) FROM vacancies WHERE created_at > now() - interval '7 days'),
    
    -- Applications
    'total_applications', (SELECT COUNT(*) FROM vacancy_applications),
    'pending_applications', (SELECT COUNT(*) FROM vacancy_applications WHERE status = 'pending'),
    'applications_7d', (SELECT COUNT(*) FROM vacancy_applications WHERE created_at > now() - interval '7 days'),
    
    -- Engagement
    'total_conversations', (SELECT COUNT(*) FROM conversations),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE sent_at > now() - interval '7 days'),
    'total_friendships', (SELECT COUNT(*) FROM friendships WHERE status = 'accepted'),
    
    -- Data health
    'auth_orphans', (
      SELECT COUNT(*) 
      FROM auth.users au 
      LEFT JOIN profiles p ON p.id = au.id 
      WHERE p.id IS NULL
    ),
    'profile_orphans', (
      SELECT COUNT(*) 
      FROM profiles p 
      LEFT JOIN auth.users au ON au.id = p.id 
      WHERE au.id IS NULL
    ),
    
    -- Timestamps
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION public.admin_get_dashboard_stats IS 'Returns aggregated statistics for the admin dashboard';

-- ============================================================================
-- SIGNUP TRENDS (for charts)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_signup_trends(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  total_signups BIGINT,
  players BIGINT,
  coaches BIGINT,
  clubs BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    d.date::DATE,
    COALESCE(COUNT(p.id), 0) AS total_signups,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'player'), 0) AS players,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'coach'), 0) AS coaches,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'club'), 0) AS clubs
  FROM generate_series(
    (now() - (p_days || ' days')::INTERVAL)::DATE,
    now()::DATE,
    '1 day'::INTERVAL
  ) AS d(date)
  LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
  GROUP BY d.date
  ORDER BY d.date ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_signup_trends IS 'Returns daily signup counts for the last N days, broken down by role';

-- ============================================================================
-- TOP COUNTRIES
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_top_countries(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  country TEXT,
  user_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    COALESCE(c.name, p.nationality, 'Unknown') AS country,
    COUNT(p.id) AS user_count
  FROM profiles p
  LEFT JOIN countries c ON c.id = p.nationality_country_id
  WHERE NOT p.is_test_account
  GROUP BY COALESCE(c.name, p.nationality, 'Unknown')
  ORDER BY user_count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.admin_get_top_countries IS 'Returns top countries by user count';

-- ============================================================================
-- AUTH ORPHANS (users without profiles)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_auth_orphans()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  intended_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    au.id AS user_id,
    au.email,
    au.created_at,
    au.last_sign_in_at,
    au.email_confirmed_at,
    au.raw_user_meta_data ->> 'role' AS intended_role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE p.id IS NULL
  ORDER BY au.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_auth_orphans IS 'Returns auth users that have no corresponding profile record';

-- ============================================================================
-- PROFILE ORPHANS (profiles without auth users)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_profile_orphans()
RETURNS TABLE (
  profile_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    p.id AS profile_id,
    p.email,
    p.full_name,
    p.role,
    p.created_at
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE au.id IS NULL
  ORDER BY p.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_profile_orphans IS 'Returns profiles that have no corresponding auth user record';

-- ============================================================================
-- BROKEN REFERENCES (applications/vacancies pointing to missing entities)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_broken_references()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'applications_missing_player', (
      SELECT json_agg(json_build_object(
        'application_id', va.id,
        'player_id', va.player_id,
        'vacancy_id', va.vacancy_id,
        'created_at', va.created_at
      ))
      FROM vacancy_applications va
      LEFT JOIN profiles p ON p.id = va.player_id
      WHERE p.id IS NULL
    ),
    'applications_missing_vacancy', (
      SELECT json_agg(json_build_object(
        'application_id', va.id,
        'player_id', va.player_id,
        'vacancy_id', va.vacancy_id,
        'created_at', va.created_at
      ))
      FROM vacancy_applications va
      LEFT JOIN vacancies v ON v.id = va.vacancy_id
      WHERE v.id IS NULL
    ),
    'vacancies_missing_club', (
      SELECT json_agg(json_build_object(
        'vacancy_id', v.id,
        'club_id', v.club_id,
        'title', v.title,
        'created_at', v.created_at
      ))
      FROM vacancies v
      LEFT JOIN profiles p ON p.id = v.club_id
      WHERE p.id IS NULL
    ),
    'messages_missing_sender', (
      SELECT json_agg(json_build_object(
        'message_id', m.id,
        'sender_id', m.sender_id,
        'conversation_id', m.conversation_id,
        'sent_at', m.sent_at
      ))
      FROM messages m
      LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE p.id IS NULL
      LIMIT 100
    ),
    'friendships_missing_users', (
      SELECT json_agg(json_build_object(
        'friendship_id', f.id,
        'requester_id', f.requester_id,
        'addressee_id', f.addressee_id,
        'missing', CASE 
          WHEN p1.id IS NULL AND p2.id IS NULL THEN 'both'
          WHEN p1.id IS NULL THEN 'requester'
          ELSE 'addressee'
        END
      ))
      FROM friendships f
      LEFT JOIN profiles p1 ON p1.id = f.requester_id
      LEFT JOIN profiles p2 ON p2.id = f.addressee_id
      WHERE p1.id IS NULL OR p2.id IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_broken_references IS 'Returns records with broken foreign key references';

-- ============================================================================
-- SEARCH PROFILES (for directory)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_search_profiles(
  p_query TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_blocked BOOLEAN DEFAULT NULL,
  p_is_test_account BOOLEAN DEFAULT NULL,
  p_onboarding_completed BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  username TEXT,
  role TEXT,
  nationality TEXT,
  base_location TEXT,
  is_blocked BOOLEAN,
  is_test_account BOOLEAN,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  avatar_url TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get total count for pagination
  SELECT COUNT(*)
  INTO v_total_count
  FROM profiles p
  WHERE 
    (p_query IS NULL OR (
      p.email ILIKE '%' || p_query || '%' OR
      p.full_name ILIKE '%' || p_query || '%' OR
      p.username ILIKE '%' || p_query || '%' OR
      p.id::TEXT = p_query
    ))
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test_account IS NULL OR p.is_test_account = p_is_test_account)
    AND (p_onboarding_completed IS NULL OR p.onboarding_completed = p_onboarding_completed);

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.username,
    p.role,
    COALESCE(c.name, p.nationality) AS nationality,
    p.base_location,
    p.is_blocked,
    p.is_test_account,
    p.onboarding_completed,
    p.created_at,
    p.updated_at,
    p.avatar_url,
    v_total_count AS total_count
  FROM profiles p
  LEFT JOIN countries c ON c.id = p.nationality_country_id
  WHERE 
    (p_query IS NULL OR (
      p.email ILIKE '%' || p_query || '%' OR
      p.full_name ILIKE '%' || p_query || '%' OR
      p.username ILIKE '%' || p_query || '%' OR
      p.id::TEXT = p_query
    ))
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test_account IS NULL OR p.is_test_account = p_is_test_account)
    AND (p_onboarding_completed IS NULL OR p.onboarding_completed = p_onboarding_completed)
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_search_profiles IS 'Search and filter profiles for the admin directory';

-- ============================================================================
-- GET PROFILE DETAILS (full profile for admin view)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_profile_details(
  p_profile_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile JSON;
  v_auth_user JSON;
  v_stats JSON;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get profile data
  SELECT row_to_json(p.*)
  INTO v_profile
  FROM profiles p
  WHERE p.id = p_profile_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Get auth user data
  SELECT json_build_object(
    'id', au.id,
    'email', au.email,
    'created_at', au.created_at,
    'last_sign_in_at', au.last_sign_in_at,
    'email_confirmed_at', au.email_confirmed_at,
    'phone', au.phone,
    'is_sso_user', au.is_sso_user
  )
  INTO v_auth_user
  FROM auth.users au
  WHERE au.id = p_profile_id;

  -- Get related stats
  SELECT json_build_object(
    'vacancies_count', (SELECT COUNT(*) FROM vacancies WHERE club_id = p_profile_id),
    'applications_count', (SELECT COUNT(*) FROM vacancy_applications WHERE player_id = p_profile_id),
    'messages_sent', (SELECT COUNT(*) FROM messages WHERE sender_id = p_profile_id),
    'conversations_count', (
      SELECT COUNT(*) FROM conversations 
      WHERE participant_1 = p_profile_id OR participant_2 = p_profile_id
    ),
    'friends_count', (
      SELECT COUNT(*) FROM friendships 
      WHERE (requester_id = p_profile_id OR addressee_id = p_profile_id) 
        AND status = 'accepted'
    ),
    'gallery_photos_count', (SELECT COUNT(*) FROM gallery_photos WHERE user_id = p_profile_id),
    'playing_history_count', (SELECT COUNT(*) FROM playing_history WHERE user_id = p_profile_id)
  )
  INTO v_stats;

  RETURN json_build_object(
    'profile', v_profile,
    'auth_user', v_auth_user,
    'stats', v_stats
  );
END;
$$;

COMMENT ON FUNCTION public.admin_get_profile_details IS 'Returns complete profile details including auth user and related stats';

-- ============================================================================
-- BLOCK USER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_block_user(
  p_profile_id UUID,
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
  v_admin_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_admin_id := auth.uid();

  -- Get current state
  SELECT jsonb_build_object(
    'is_blocked', p.is_blocked,
    'blocked_at', p.blocked_at,
    'blocked_reason', p.blocked_reason,
    'blocked_by', p.blocked_by
  )
  INTO v_old_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  IF v_old_data IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Update profile
  UPDATE profiles
  SET 
    is_blocked = true,
    blocked_at = now(),
    blocked_reason = p_reason,
    blocked_by = v_admin_id,
    updated_at = now()
  WHERE id = p_profile_id;

  -- Get new state
  SELECT jsonb_build_object(
    'is_blocked', p.is_blocked,
    'blocked_at', p.blocked_at,
    'blocked_reason', p.blocked_reason,
    'blocked_by', p.blocked_by
  )
  INTO v_new_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  -- Log the action
  PERFORM public.admin_log_action(
    'block_user',
    'profile',
    p_profile_id,
    v_old_data,
    v_new_data,
    jsonb_build_object('reason', p_reason)
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'blocked_at', now()
  );
END;
$$;

COMMENT ON FUNCTION public.admin_block_user IS 'Blocks a user account with optional reason';

-- ============================================================================
-- UNBLOCK USER
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_unblock_user(
  p_profile_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_data JSONB;
  v_new_data JSONB;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get current state
  SELECT jsonb_build_object(
    'is_blocked', p.is_blocked,
    'blocked_at', p.blocked_at,
    'blocked_reason', p.blocked_reason,
    'blocked_by', p.blocked_by
  )
  INTO v_old_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  IF v_old_data IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Update profile
  UPDATE profiles
  SET 
    is_blocked = false,
    blocked_at = NULL,
    blocked_reason = NULL,
    blocked_by = NULL,
    updated_at = now()
  WHERE id = p_profile_id;

  -- Get new state
  v_new_data := jsonb_build_object(
    'is_blocked', false,
    'blocked_at', NULL,
    'blocked_reason', NULL,
    'blocked_by', NULL
  );

  -- Log the action
  PERFORM public.admin_log_action(
    'unblock_user',
    'profile',
    p_profile_id,
    v_old_data,
    v_new_data,
    '{}'::JSONB
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id
  );
END;
$$;

COMMENT ON FUNCTION public.admin_unblock_user IS 'Unblocks a previously blocked user account';

-- ============================================================================
-- UPDATE PROFILE (admin edit)
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
    'nationality', 'base_location', 'position', 'secondary_position',
    'gender', 'is_test_account', 'onboarding_completed'
  ];
  v_field TEXT;
  v_update_sql TEXT := '';
  v_first BOOLEAN := true;
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

  -- Build and execute dynamic update
  UPDATE profiles
  SET 
    full_name = COALESCE(p_updates ->> 'full_name', full_name),
    username = COALESCE(p_updates ->> 'username', username),
    email = COALESCE(p_updates ->> 'email', email),
    bio = COALESCE(p_updates ->> 'bio', bio),
    club_bio = COALESCE(p_updates ->> 'club_bio', club_bio),
    nationality = COALESCE(p_updates ->> 'nationality', nationality),
    base_location = COALESCE(p_updates ->> 'base_location', base_location),
    position = COALESCE(p_updates ->> 'position', position),
    secondary_position = COALESCE(p_updates ->> 'secondary_position', secondary_position),
    gender = COALESCE(p_updates ->> 'gender', gender),
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
    jsonb_build_object('reason', p_reason, 'fields_updated', jsonb_object_keys(p_updates))
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'updated_fields', (SELECT array_agg(k) FROM jsonb_object_keys(p_updates) k)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_update_profile IS 'Updates profile fields with audit logging';

-- ============================================================================
-- GET AUDIT LOGS (with pagination)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_audit_logs(
  p_action TEXT DEFAULT NULL,
  p_target_type TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  admin_id UUID,
  admin_email TEXT,
  admin_name TEXT,
  action TEXT,
  target_type TEXT,
  target_id UUID,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get total count
  SELECT COUNT(*)
  INTO v_total_count
  FROM admin_audit_logs l
  WHERE 
    (p_action IS NULL OR l.action = p_action)
    AND (p_target_type IS NULL OR l.target_type = p_target_type)
    AND (p_admin_id IS NULL OR l.admin_id = p_admin_id);

  RETURN QUERY
  SELECT 
    l.id,
    l.admin_id,
    p.email AS admin_email,
    p.full_name AS admin_name,
    l.action,
    l.target_type,
    l.target_id,
    l.old_data,
    l.new_data,
    l.metadata,
    l.created_at,
    v_total_count AS total_count
  FROM admin_audit_logs l
  LEFT JOIN profiles p ON p.id = l.admin_id
  WHERE 
    (p_action IS NULL OR l.action = p_action)
    AND (p_target_type IS NULL OR l.target_type = p_target_type)
    AND (p_admin_id IS NULL OR l.admin_id = p_admin_id)
  ORDER BY l.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_audit_logs IS 'Returns paginated audit logs with optional filtering';

-- ============================================================================
-- DELETE ORPHAN PROFILE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_orphan_profile(
  p_profile_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_data JSONB;
  v_has_auth_user BOOLEAN;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Check if this is actually an orphan
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = p_profile_id)
  INTO v_has_auth_user;

  IF v_has_auth_user THEN
    RAISE EXCEPTION 'Profile has an auth user. Use standard delete flow instead.';
  END IF;

  -- Get profile data for audit log
  SELECT to_jsonb(p.*)
  INTO v_profile_data
  FROM profiles p
  WHERE p.id = p_profile_id;

  IF v_profile_data IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Delete the profile (cascades to related tables)
  DELETE FROM profiles WHERE id = p_profile_id;

  -- Log the action
  PERFORM public.admin_log_action(
    'delete_orphan_profile',
    'profile',
    p_profile_id,
    v_profile_data,
    NULL,
    jsonb_build_object('type', 'orphan_cleanup')
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'deleted_data', v_profile_data
  );
END;
$$;

COMMENT ON FUNCTION public.admin_delete_orphan_profile IS 'Deletes a profile that has no corresponding auth user';

-- ============================================================================
-- MARK AS TEST ACCOUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_set_test_account(
  p_profile_id UUID,
  p_is_test BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_value BOOLEAN;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get current value
  SELECT is_test_account
  INTO v_old_value
  FROM profiles
  WHERE id = p_profile_id;

  IF v_old_value IS NULL THEN
    RAISE EXCEPTION 'Profile not found: %', p_profile_id;
  END IF;

  -- Update
  UPDATE profiles
  SET is_test_account = p_is_test, updated_at = now()
  WHERE id = p_profile_id;

  -- Log the action
  PERFORM public.admin_log_action(
    CASE WHEN p_is_test THEN 'mark_test_account' ELSE 'unmark_test_account' END,
    'profile',
    p_profile_id,
    jsonb_build_object('is_test_account', v_old_value),
    jsonb_build_object('is_test_account', p_is_test),
    '{}'::JSONB
  );

  RETURN json_build_object(
    'success', true,
    'profile_id', p_profile_id,
    'is_test_account', p_is_test
  );
END;
$$;

COMMENT ON FUNCTION public.admin_set_test_account IS 'Marks or unmarks a profile as a test account';
