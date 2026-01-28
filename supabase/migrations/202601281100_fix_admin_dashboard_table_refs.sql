-- ============================================================================
-- FIX ADMIN DASHBOARD TABLE REFERENCES
-- ============================================================================
-- Updates admin RPC functions to use the new table names after terminology
-- alignment:
--   - vacancies → opportunities
--   - vacancy_applications → opportunity_applications
--   - player_id → applicant_id
--   - playing_history → career_history
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. FIX admin_get_dashboard_stats
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

    -- Content metrics (FIXED: use new table names)
    'total_vacancies', (SELECT COUNT(*) FROM opportunities),
    'open_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'open'),
    'closed_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'closed'),
    'draft_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'draft'),
    'vacancies_7d', (SELECT COUNT(*) FROM opportunities WHERE created_at > now() - interval '7 days'),

    -- Applications (FIXED: use new table name)
    'total_applications', (SELECT COUNT(*) FROM opportunity_applications),
    'pending_applications', (SELECT COUNT(*) FROM opportunity_applications WHERE status = 'pending'),
    'applications_7d', (SELECT COUNT(*) FROM opportunity_applications WHERE applied_at > now() - interval '7 days'),

    -- Engagement
    'total_conversations', (SELECT COUNT(*) FROM conversations),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE sent_at > now() - interval '7 days'),
    'total_friendships', (SELECT COUNT(*) FROM profile_friendships WHERE status = 'accepted'),

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

-- ============================================================================
-- 2. FIX admin_get_profile_details
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

  -- Get related stats (FIXED: use new table/column names)
  SELECT json_build_object(
    'vacancies_count', (SELECT COUNT(*) FROM opportunities WHERE club_id = p_profile_id),
    'applications_count', (SELECT COUNT(*) FROM opportunity_applications WHERE applicant_id = p_profile_id),
    'messages_sent', (SELECT COUNT(*) FROM messages WHERE sender_id = p_profile_id),
    'conversations_count', (
      SELECT COUNT(*) FROM conversations
      WHERE participant_one_id = p_profile_id OR participant_two_id = p_profile_id
    ),
    'friends_count', (
      SELECT COUNT(*) FROM profile_friendships
      WHERE (user_one = p_profile_id OR user_two = p_profile_id)
        AND status = 'accepted'
    ),
    'gallery_photos_count', (SELECT COUNT(*) FROM gallery_photos WHERE user_id = p_profile_id),
    'playing_history_count', (SELECT COUNT(*) FROM career_history WHERE user_id = p_profile_id)
  )
  INTO v_stats;

  RETURN json_build_object(
    'profile', v_profile,
    'auth_user', v_auth_user,
    'stats', v_stats
  );
END;
$$;

-- ============================================================================
-- 3. FIX admin_get_broken_references
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
    'applications_missing_applicant', (
      SELECT json_agg(json_build_object(
        'application_id', oa.id,
        'applicant_id', oa.applicant_id,
        'opportunity_id', oa.opportunity_id,
        'created_at', oa.applied_at
      ))
      FROM opportunity_applications oa
      LEFT JOIN profiles p ON p.id = oa.applicant_id
      WHERE p.id IS NULL
    ),
    'applications_missing_opportunity', (
      SELECT json_agg(json_build_object(
        'application_id', oa.id,
        'applicant_id', oa.applicant_id,
        'opportunity_id', oa.opportunity_id,
        'created_at', oa.applied_at
      ))
      FROM opportunity_applications oa
      LEFT JOIN opportunities o ON o.id = oa.opportunity_id
      WHERE o.id IS NULL
    ),
    'opportunities_missing_club', (
      SELECT json_agg(json_build_object(
        'opportunity_id', o.id,
        'club_id', o.club_id,
        'title', o.title,
        'created_at', o.created_at
      ))
      FROM opportunities o
      LEFT JOIN profiles p ON p.id = o.club_id
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
        'user_one', f.user_one,
        'user_two', f.user_two,
        'missing', CASE
          WHEN p1.id IS NULL AND p2.id IS NULL THEN 'both'
          WHEN p1.id IS NULL THEN 'user_one'
          ELSE 'user_two'
        END
      ))
      FROM profile_friendships f
      LEFT JOIN profiles p1 ON p1.id = f.user_one
      LEFT JOIN profiles p2 ON p2.id = f.user_two
      WHERE p1.id IS NULL OR p2.id IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. FIX admin_search_profiles (if it uses old names)
-- ============================================================================
-- This function is already correct, but let's ensure it uses proper references
CREATE OR REPLACE FUNCTION public.admin_search_profiles(
  p_query TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_is_blocked BOOLEAN DEFAULT NULL,
  p_is_test BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_sort TEXT DEFAULT 'created_at_desc'
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  username TEXT,
  role TEXT,
  avatar_url TEXT,
  country TEXT,
  is_blocked BOOLEAN,
  is_test_account BOOLEAN,
  is_platform_admin BOOLEAN,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR p.username ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_country IS NULL OR p.country = p_country)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test IS NULL OR p.is_test_account = p_is_test);

  RETURN QUERY
  SELECT
    p.id,
    au.email,
    p.full_name,
    p.username,
    p.role,
    p.avatar_url,
    p.country,
    p.is_blocked,
    p.is_test_account,
    p.is_platform_admin,
    p.onboarding_completed,
    p.created_at,
    v_total AS total_count
  FROM profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE
    (p_query IS NULL OR p.full_name ILIKE '%' || p_query || '%' OR p.username ILIKE '%' || p_query || '%' OR au.email ILIKE '%' || p_query || '%')
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_country IS NULL OR p.country = p_country)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test IS NULL OR p.is_test_account = p_is_test)
  ORDER BY
    CASE WHEN p_sort = 'created_at_desc' THEN p.created_at END DESC,
    CASE WHEN p_sort = 'created_at_asc' THEN p.created_at END ASC,
    CASE WHEN p_sort = 'name_asc' THEN p.full_name END ASC,
    CASE WHEN p_sort = 'name_desc' THEN p.full_name END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
