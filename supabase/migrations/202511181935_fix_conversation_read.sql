-- Fix mark_conversation_messages_read to avoid reserved CURRENT_USER keyword shadowing
CREATE OR REPLACE FUNCTION public.mark_conversation_messages_read(
  p_conversation_id UUID,
  p_before TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID := auth.uid();
  cutoff TIMESTAMPTZ := COALESCE(p_before, timezone('utc', now()));
  updated_rows INTEGER := 0;
BEGIN
  IF current_profile_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (c.participant_one_id = current_profile_id OR c.participant_two_id = current_profile_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.messages
     SET read_at = timezone('utc', now())
   WHERE conversation_id = p_conversation_id
     AND sender_id <> current_profile_id
     AND read_at IS NULL
     AND (p_before IS NULL OR sent_at <= cutoff);

  GET DIAGNOSTICS updated_rows = ROW_COUNT;

  RETURN updated_rows;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_messages_read(UUID, TIMESTAMPTZ) TO authenticated;
