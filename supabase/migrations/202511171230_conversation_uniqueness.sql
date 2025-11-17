-- Normalize and enforce unique DM conversations between two participants
BEGIN;

-- Move messages from duplicate conversations into the primary conversation for each participant pair
WITH normalized AS (
  SELECT
    id,
    participant_one_id,
    participant_two_id,
    LEAST(participant_one_id, participant_two_id) AS user_a,
    GREATEST(participant_one_id, participant_two_id) AS user_b,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id)
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.conversations
), duplicates AS (
  SELECT
    dup.id AS duplicate_id,
    primary_conversation.id AS primary_id
  FROM normalized dup
  JOIN normalized primary_conversation
    ON primary_conversation.user_a = dup.user_a
   AND primary_conversation.user_b = dup.user_b
   AND primary_conversation.row_num = 1
  WHERE dup.row_num > 1
)
UPDATE public.messages m
SET conversation_id = d.primary_id
FROM duplicates d
WHERE m.conversation_id = d.duplicate_id;

-- Remove the redundant conversation rows now that their messages have been migrated
WITH normalized AS (
  SELECT
    id,
    LEAST(participant_one_id, participant_two_id) AS user_a,
    GREATEST(participant_one_id, participant_two_id) AS user_b,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id)
      ORDER BY created_at ASC, id ASC
    ) AS row_num
  FROM public.conversations
), duplicates AS (
  SELECT id FROM normalized WHERE row_num > 1
)
DELETE FROM public.conversations c
USING duplicates d
WHERE c.id = d.id;

-- Recalculate last_message_at and updated_at timestamps based on the merged message history
WITH message_stats AS (
  SELECT conversation_id, MAX(sent_at) AS max_sent_at
  FROM public.messages
  GROUP BY conversation_id
)
UPDATE public.conversations c
SET last_message_at = COALESCE(ms.max_sent_at, c.last_message_at),
    updated_at = GREATEST(c.updated_at, COALESCE(ms.max_sent_at, c.updated_at))
FROM message_stats ms
WHERE c.id = ms.conversation_id;

-- Enforce uniqueness for each participant pair regardless of ordering
CREATE UNIQUE INDEX IF NOT EXISTS conversations_participant_pair_unique
  ON public.conversations (
    LEAST(participant_one_id, participant_two_id),
    GREATEST(participant_one_id, participant_two_id)
  );

COMMIT;
