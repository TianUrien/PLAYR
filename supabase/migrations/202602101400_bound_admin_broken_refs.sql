-- ============================================================================
-- BOUND ADMIN BROKEN REFERENCES QUERY
-- ============================================================================
-- Adds LIMIT 100 to the 4 unbounded json_agg subqueries in
-- admin_get_broken_references(). Prevents OOM if orphan counts grow large.
-- Only messages_missing_sender already had a LIMIT.
-- ============================================================================

SET search_path = public;

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
      SELECT json_agg(t) FROM (
        SELECT json_build_object(
          'application_id', oa.id,
          'applicant_id', oa.applicant_id,
          'opportunity_id', oa.opportunity_id,
          'created_at', oa.applied_at
        ) AS t
        FROM opportunity_applications oa
        LEFT JOIN profiles p ON p.id = oa.applicant_id
        WHERE p.id IS NULL
        LIMIT 100
      ) sub
    ),
    'applications_missing_opportunity', (
      SELECT json_agg(t) FROM (
        SELECT json_build_object(
          'application_id', oa.id,
          'applicant_id', oa.applicant_id,
          'opportunity_id', oa.opportunity_id,
          'created_at', oa.applied_at
        ) AS t
        FROM opportunity_applications oa
        LEFT JOIN opportunities o ON o.id = oa.opportunity_id
        WHERE o.id IS NULL
        LIMIT 100
      ) sub
    ),
    'opportunities_missing_club', (
      SELECT json_agg(t) FROM (
        SELECT json_build_object(
          'opportunity_id', o.id,
          'club_id', o.club_id,
          'title', o.title,
          'created_at', o.created_at
        ) AS t
        FROM opportunities o
        LEFT JOIN profiles p ON p.id = o.club_id
        WHERE p.id IS NULL
        LIMIT 100
      ) sub
    ),
    'messages_missing_sender', (
      SELECT json_agg(t) FROM (
        SELECT json_build_object(
          'message_id', m.id,
          'sender_id', m.sender_id,
          'conversation_id', m.conversation_id,
          'sent_at', m.sent_at
        ) AS t
        FROM messages m
        LEFT JOIN profiles p ON p.id = m.sender_id
        WHERE p.id IS NULL
        LIMIT 100
      ) sub
    ),
    'friendships_missing_users', (
      SELECT json_agg(t) FROM (
        SELECT json_build_object(
          'friendship_id', f.id,
          'requester_id', f.requester_id,
          'user_one', f.user_one,
          'user_two', f.user_two,
          'missing', CASE
            WHEN p1.id IS NULL AND p2.id IS NULL THEN 'both'
            WHEN p1.id IS NULL THEN 'user_one'
            ELSE 'user_two'
          END
        ) AS t
        FROM profile_friendships f
        LEFT JOIN profiles p1 ON p1.id = f.user_one
        LEFT JOIN profiles p2 ON p2.id = f.user_two
        WHERE p1.id IS NULL OR p2.id IS NULL
        LIMIT 100
      ) sub
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
