BEGIN;

-- Extend get_user_conversations with cursor-based pagination and has_more flag
DROP FUNCTION IF EXISTS public.get_user_conversations(UUID, INT);

CREATE OR REPLACE FUNCTION public.get_user_conversations(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_cursor_last_message_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_conversation_id UUID DEFAULT NULL
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
  conversation_last_message_at TIMESTAMPTZ,
  has_more BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_requesting_user UUID := auth.uid();
BEGIN
  IF v_requesting_user IS NULL THEN
    RAISE EXCEPTION 'get_user_conversations requires authentication' USING ERRCODE = '42501';
  END IF;

  IF v_requesting_user <> p_user_id THEN
    RAISE EXCEPTION 'Cannot fetch conversations for another user' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH user_conversations AS (
    SELECT
      c.id AS conv_id,
      CASE WHEN c.participant_one_id = p_user_id THEN c.participant_two_id ELSE c.participant_one_id END AS other_user_id,
      c.created_at,
      c.updated_at,
      c.last_message_at,
      COALESCE(c.last_message_at, c.created_at) AS sort_timestamp
    FROM public.conversations c
    WHERE c.participant_one_id = p_user_id OR c.participant_two_id = p_user_id
  ),
  paginated AS (
    SELECT *
    FROM user_conversations uc
    WHERE (
      p_cursor_last_message_at IS NULL
      AND p_cursor_conversation_id IS NULL
    ) OR (
      uc.sort_timestamp < p_cursor_last_message_at
    ) OR (
      uc.sort_timestamp = p_cursor_last_message_at
      AND (p_cursor_conversation_id IS NULL OR uc.conv_id < p_cursor_conversation_id)
    )
    ORDER BY uc.sort_timestamp DESC, uc.conv_id DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200) + 1
  ),
  limited AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY sort_timestamp DESC, conv_id DESC) AS row_num FROM paginated
  ),
  final_page AS (
    SELECT * FROM limited WHERE row_num <= LEAST(GREATEST(p_limit, 1), 200)
  ),
  last_messages AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.sent_at,
      m.sender_id
    FROM public.messages m
    INNER JOIN final_page fp ON fp.conv_id = m.conversation_id
    ORDER BY m.conversation_id, m.sent_at DESC
  ),
  unread_counts AS (
    SELECT
      m.conversation_id,
      COUNT(*) AS unread_count
    FROM public.messages m
    INNER JOIN final_page fp ON fp.conv_id = m.conversation_id
    WHERE m.sender_id <> p_user_id
      AND m.read_at IS NULL
    GROUP BY m.conversation_id
  )
  SELECT
    fp.conv_id,
    fp.other_user_id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.role::TEXT,
    lm.content,
    lm.sent_at,
    lm.sender_id,
    COALESCE(ur.unread_count, 0),
    fp.created_at,
    fp.updated_at,
    fp.last_message_at,
    EXISTS (SELECT 1 FROM limited WHERE row_num > LEAST(GREATEST(p_limit, 1), 200)) AS has_more
  FROM final_page fp
  LEFT JOIN public.profiles p ON p.id = fp.other_user_id
  LEFT JOIN last_messages lm ON lm.conversation_id = fp.conv_id
  LEFT JOIN unread_counts ur ON ur.conversation_id = fp.conv_id
  ORDER BY fp.sort_timestamp DESC, fp.conv_id DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations(UUID, INT, TIMESTAMPTZ, UUID) TO authenticated;
COMMENT ON FUNCTION public.get_user_conversations IS 'Returns paginated conversation list with cursor support and unread metadata.';

-- Supporting index for cursor ordering (last_message_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_id_desc
  ON public.conversations (last_message_at DESC NULLS LAST, id DESC);

COMMIT;
