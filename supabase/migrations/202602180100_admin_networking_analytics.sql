-- ============================================================================
-- ADMIN NETWORKING ANALYTICS RPCs
-- ============================================================================
-- Three independent RPCs for messaging, friendship, and reference analytics.
-- All support time-window filtering, test-account exclusion, and role filtering.
--
-- Tables queried:
--   conversations (participant_one_id, participant_two_id, last_message_at)
--   messages (conversation_id, sender_id, sent_at, read_at)
--   profile_friendships (user_one, user_two, requester_id, status, accepted_at)
--   profile_references (requester_id, reference_id, status, accepted_at)
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. MESSAGING METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_messaging_metrics(
  p_days INTEGER DEFAULT 30,
  p_exclude_test BOOLEAN DEFAULT true,
  p_role TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_now TIMESTAMPTZ := now();
  v_date_filter TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_date_filter := CASE
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ
    ELSE v_now - (p_days || ' days')::INTERVAL
  END;

  WITH eligible_users AS (
    SELECT id FROM profiles
    WHERE (NOT p_exclude_test OR NOT is_test_account)
      AND (p_role IS NULL OR role = p_role)
  )
  SELECT json_build_object(
    -- Conversation counts
    'total_conversations', (
      SELECT COUNT(*) FROM conversations c
      WHERE c.participant_one_id IN (SELECT id FROM eligible_users)
         OR c.participant_two_id IN (SELECT id FROM eligible_users)
    ),
    'active_conversations_7d', (
      SELECT COUNT(*) FROM conversations c
      WHERE c.last_message_at > v_now - interval '7 days'
        AND (c.participant_one_id IN (SELECT id FROM eligible_users)
          OR c.participant_two_id IN (SELECT id FROM eligible_users))
    ),
    'active_conversations_30d', (
      SELECT COUNT(*) FROM conversations c
      WHERE c.last_message_at > v_now - interval '30 days'
        AND (c.participant_one_id IN (SELECT id FROM eligible_users)
          OR c.participant_two_id IN (SELECT id FROM eligible_users))
    ),

    -- Message counts
    'total_messages', (
      SELECT COUNT(*) FROM messages m
      WHERE m.sender_id IN (SELECT id FROM eligible_users)
    ),
    'messages_7d', (
      SELECT COUNT(*) FROM messages m
      WHERE m.sender_id IN (SELECT id FROM eligible_users)
        AND m.sent_at > v_now - interval '7 days'
    ),
    'messages_30d', (
      SELECT COUNT(*) FROM messages m
      WHERE m.sender_id IN (SELECT id FROM eligible_users)
        AND m.sent_at > v_now - interval '30 days'
    ),

    -- Averages
    'avg_messages_per_conversation', (
      SELECT COALESCE(ROUND(AVG(msg_count), 1), 0) FROM (
        SELECT c.id, COUNT(m.id) as msg_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.participant_one_id IN (SELECT id FROM eligible_users)
           OR c.participant_two_id IN (SELECT id FROM eligible_users)
        GROUP BY c.id
      ) sub
    ),

    -- User activity
    'users_who_messaged_30d', (
      SELECT COUNT(DISTINCT m.sender_id) FROM messages m
      WHERE m.sender_id IN (SELECT id FROM eligible_users)
        AND m.sent_at > v_now - interval '30 days'
    ),
    'users_never_messaged', (
      SELECT COUNT(*) FROM eligible_users eu
      WHERE NOT EXISTS (
        SELECT 1 FROM messages m WHERE m.sender_id = eu.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.participant_one_id = eu.id OR c.participant_two_id = eu.id
      )
    ),

    -- Read rate
    'message_read_rate', (
      SELECT COALESCE(
        ROUND(
          COUNT(*) FILTER (WHERE m.read_at IS NOT NULL)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
        1),
      0)
      FROM messages m
      WHERE m.sender_id IN (SELECT id FROM eligible_users)
    ),

    -- Daily trend (within the time window)
    'messaging_trend', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json) FROM (
        SELECT (m.sent_at AT TIME ZONE 'UTC')::DATE as date,
               COUNT(*) as message_count
        FROM messages m
        WHERE m.sender_id IN (SELECT id FROM eligible_users)
          AND m.sent_at > v_date_filter
        GROUP BY 1
        ORDER BY 1
      ) t
    ),

    -- Top messagers
    'top_messagers', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT p.id, p.full_name as name, p.role, COUNT(m.id) as message_count
        FROM messages m
        JOIN profiles p ON p.id = m.sender_id
        WHERE p.id IN (SELECT id FROM eligible_users)
          AND m.sent_at > v_date_filter
        GROUP BY p.id, p.full_name, p.role
        ORDER BY COUNT(m.id) DESC
        LIMIT 10
      ) t
    ),

    -- Top conversations (relationship view)
    'top_conversations', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT
          p1.full_name as participant_one_name,
          p1.role as participant_one_role,
          p2.full_name as participant_two_name,
          p2.role as participant_two_role,
          COUNT(m.id) as message_count,
          MAX(m.sent_at) as last_message_at
        FROM conversations c
        JOIN profiles p1 ON p1.id = c.participant_one_id
        JOIN profiles p2 ON p2.id = c.participant_two_id
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE (c.participant_one_id IN (SELECT id FROM eligible_users)
            OR c.participant_two_id IN (SELECT id FROM eligible_users))
        GROUP BY c.id, p1.full_name, p1.role, p2.full_name, p2.role
        HAVING COUNT(m.id) > 0
        ORDER BY COUNT(m.id) DESC
        LIMIT 20
      ) t
    ),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_messaging_metrics IS 'Returns messaging analytics with filtering (admin only)';

-- ============================================================================
-- 2. FRIENDSHIP METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_friendship_metrics(
  p_days INTEGER DEFAULT 30,
  p_exclude_test BOOLEAN DEFAULT true,
  p_role TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_now TIMESTAMPTZ := now();
  v_date_filter TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_date_filter := CASE
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ
    ELSE v_now - (p_days || ' days')::INTERVAL
  END;

  WITH eligible_users AS (
    SELECT id FROM profiles
    WHERE (NOT p_exclude_test OR NOT is_test_account)
      AND (p_role IS NULL OR role = p_role)
  )
  SELECT json_build_object(
    -- Totals
    'total_friendships', (
      SELECT COUNT(*) FROM profile_friendships f
      WHERE f.status = 'accepted'
        AND (f.user_one IN (SELECT id FROM eligible_users)
          OR f.user_two IN (SELECT id FROM eligible_users))
    ),
    'pending_requests', (
      SELECT COUNT(*) FROM profile_friendships f
      WHERE f.status = 'pending'
        AND (f.user_one IN (SELECT id FROM eligible_users)
          OR f.user_two IN (SELECT id FROM eligible_users))
    ),

    -- Time-windowed
    'friendships_7d', (
      SELECT COUNT(*) FROM profile_friendships f
      WHERE f.status = 'accepted'
        AND f.accepted_at > v_now - interval '7 days'
        AND (f.user_one IN (SELECT id FROM eligible_users)
          OR f.user_two IN (SELECT id FROM eligible_users))
    ),
    'friendships_30d', (
      SELECT COUNT(*) FROM profile_friendships f
      WHERE f.status = 'accepted'
        AND f.accepted_at > v_now - interval '30 days'
        AND (f.user_one IN (SELECT id FROM eligible_users)
          OR f.user_two IN (SELECT id FROM eligible_users))
    ),

    -- Acceptance rate
    'acceptance_rate', (
      SELECT COALESCE(
        ROUND(
          COUNT(*) FILTER (WHERE f.status = 'accepted')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE f.status IN ('accepted', 'rejected', 'cancelled')), 0) * 100,
        1),
      0)
      FROM profile_friendships f
      WHERE f.user_one IN (SELECT id FROM eligible_users)
         OR f.user_two IN (SELECT id FROM eligible_users)
    ),

    -- Per-user averages
    'avg_friends_per_user', (
      SELECT COALESCE(ROUND(AVG(friend_count), 1), 0) FROM (
        SELECT eu.id, COUNT(f.id) as friend_count
        FROM eligible_users eu
        LEFT JOIN profile_friendships f
          ON (f.user_one = eu.id OR f.user_two = eu.id)
          AND f.status = 'accepted'
        GROUP BY eu.id
      ) sub
    ),
    'users_with_zero_friends', (
      SELECT COUNT(*) FROM eligible_users eu
      WHERE NOT EXISTS (
        SELECT 1 FROM profile_friendships f
        WHERE (f.user_one = eu.id OR f.user_two = eu.id)
          AND f.status = 'accepted'
      )
    ),

    -- Daily trend
    'friendship_trend', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json) FROM (
        SELECT (f.accepted_at AT TIME ZONE 'UTC')::DATE as date,
               COUNT(*) as friendship_count
        FROM profile_friendships f
        WHERE f.status = 'accepted'
          AND f.accepted_at IS NOT NULL
          AND f.accepted_at > v_date_filter
          AND (f.user_one IN (SELECT id FROM eligible_users)
            OR f.user_two IN (SELECT id FROM eligible_users))
        GROUP BY 1
        ORDER BY 1
      ) t
    ),

    -- Top connectors
    'top_connectors', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT p.id, p.full_name as name, p.role, COUNT(f.id) as friend_count
        FROM eligible_users eu
        JOIN profiles p ON p.id = eu.id
        JOIN profile_friendships f
          ON (f.user_one = eu.id OR f.user_two = eu.id)
          AND f.status = 'accepted'
        GROUP BY p.id, p.full_name, p.role
        ORDER BY COUNT(f.id) DESC
        LIMIT 10
      ) t
    ),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_friendship_metrics IS 'Returns friendship analytics with filtering (admin only)';

-- ============================================================================
-- 3. REFERENCE METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_reference_metrics(
  p_days INTEGER DEFAULT 30,
  p_exclude_test BOOLEAN DEFAULT true,
  p_role TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  WITH eligible_users AS (
    SELECT id FROM profiles
    WHERE (NOT p_exclude_test OR NOT is_test_account)
      AND (p_role IS NULL OR role = p_role)
  )
  SELECT json_build_object(
    -- Totals
    'total_references', (
      SELECT COUNT(*) FROM profile_references r
      WHERE r.status = 'accepted'
        AND (r.requester_id IN (SELECT id FROM eligible_users)
          OR r.reference_id IN (SELECT id FROM eligible_users))
    ),
    'pending_references', (
      SELECT COUNT(*) FROM profile_references r
      WHERE r.status = 'pending'
        AND (r.requester_id IN (SELECT id FROM eligible_users)
          OR r.reference_id IN (SELECT id FROM eligible_users))
    ),

    -- Acceptance rate
    'reference_acceptance_rate', (
      SELECT COALESCE(
        ROUND(
          COUNT(*) FILTER (WHERE r.status = 'accepted')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE r.status IN ('accepted', 'declined')), 0) * 100,
        1),
      0)
      FROM profile_references r
      WHERE r.requester_id IN (SELECT id FROM eligible_users)
         OR r.reference_id IN (SELECT id FROM eligible_users)
    ),

    -- Time-windowed
    'references_30d', (
      SELECT COUNT(*) FROM profile_references r
      WHERE r.status = 'accepted'
        AND r.accepted_at > v_now - interval '30 days'
        AND (r.requester_id IN (SELECT id FROM eligible_users)
          OR r.reference_id IN (SELECT id FROM eligible_users))
    ),

    -- Unique users
    'users_with_references', (
      SELECT COUNT(DISTINCT r.requester_id) FROM profile_references r
      WHERE r.status = 'accepted'
        AND r.requester_id IN (SELECT id FROM eligible_users)
    ),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_reference_metrics IS 'Returns reference/endorsement analytics with filtering (admin only)';

-- ============================================================================
-- 4. PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.admin_get_messaging_metrics(INTEGER, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_friendship_metrics(INTEGER, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_reference_metrics(INTEGER, BOOLEAN, TEXT) TO authenticated;
