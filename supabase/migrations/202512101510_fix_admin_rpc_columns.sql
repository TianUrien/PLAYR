-- ============================================================================
-- FIX ADMIN RPC FUNCTIONS - CORRECT COLUMN NAMES
-- ============================================================================
-- Fix column references that don't match the actual schema:
-- - vacancy_applications.created_at -> applied_at
-- - friendships -> profile_friendships
-- - conversations participant columns
-- ============================================================================

-- Fix admin_get_dashboard_stats
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
    
    -- Applications (use applied_at instead of created_at)
    'total_applications', (SELECT COUNT(*) FROM vacancy_applications),
    'pending_applications', (SELECT COUNT(*) FROM vacancy_applications WHERE status = 'pending'),
    'applications_7d', (SELECT COUNT(*) FROM vacancy_applications WHERE applied_at > now() - interval '7 days'),
    
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

-- Fix admin_get_profile_details (conversations use participant_one_id/participant_two_id)
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

  -- Get related stats (fix column names)
  SELECT json_build_object(
    'vacancies_count', (SELECT COUNT(*) FROM vacancies WHERE club_id = p_profile_id),
    'applications_count', (SELECT COUNT(*) FROM vacancy_applications WHERE player_id = p_profile_id),
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

-- Fix admin_get_broken_references (use profile_friendships and correct column names)
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
        'created_at', va.applied_at
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
        'created_at', va.applied_at
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
