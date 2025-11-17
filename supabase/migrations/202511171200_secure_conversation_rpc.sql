-- Enforce auth.uid() checks inside get_user_conversations to prevent callers from spoofing user ids
BEGIN;

CREATE OR REPLACE FUNCTION public.get_user_conversations(
  p_user_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  conversation_id UUID,
  other_participant_id UUID,
  other_participant_name TEXT,
  other_participant_username TEXT,
  other_participant_avatar TEXT,
  other_participant_role TEXT,
  last_message_content TEXT,
  last_message_sent_at TIMESTAMPTZ,
  last_message_sender_id UUID,
  unread_count BIGINT,
  conversation_created_at TIMESTAMPTZ,
  conversation_updated_at TIMESTAMPTZ,
  conversation_last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'This RPC requires authentication' USING ERRCODE = '28000';
  END IF;

  IF p_user_id IS DISTINCT FROM current_user_id THEN
    RAISE EXCEPTION 'Cannot fetch conversations for another user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH user_conversations AS (
    SELECT
      c.id AS conv_id,
      CASE WHEN c.participant_one_id = current_user_id THEN c.participant_two_id ELSE c.participant_one_id END AS other_user_id,
      c.created_at,
      c.updated_at,
      c.last_message_at
    FROM public.conversations c
    WHERE c.participant_one_id = current_user_id OR c.participant_two_id = current_user_id
    ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
    LIMIT p_limit
  ),
  last_messages AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.sent_at,
      m.sender_id
    FROM public.messages m
    INNER JOIN user_conversations uc ON uc.conv_id = m.conversation_id
    ORDER BY m.conversation_id, m.sent_at DESC
  ),
  unread_counts AS (
    SELECT
      m.conversation_id,
      COUNT(*) AS unread_count
    FROM public.messages m
    INNER JOIN user_conversations uc ON uc.conv_id = m.conversation_id
    WHERE m.sender_id <> current_user_id
      AND m.read_at IS NULL
    GROUP BY m.conversation_id
  )
  SELECT
    uc.conv_id,
    uc.other_user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.role::TEXT,
    lm.content,
    lm.sent_at,
    lm.sender_id,
    COALESCE(ur.unread_count, 0),
    uc.created_at,
    uc.updated_at,
    uc.last_message_at
  FROM user_conversations uc
  LEFT JOIN public.profiles p ON p.id = uc.other_user_id
  LEFT JOIN last_messages lm ON lm.conversation_id = uc.conv_id
  LEFT JOIN unread_counts ur ON ur.conversation_id = uc.conv_id
  ORDER BY uc.last_message_at DESC NULLS LAST, uc.created_at DESC;
END;
$$;

COMMIT;
