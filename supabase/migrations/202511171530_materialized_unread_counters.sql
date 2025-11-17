SET search_path = public;

BEGIN;

-- =========================================================================
-- Persisted unread counters table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_unread_counters (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  unread_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.user_unread_counters IS 'Materialized unread message counters per user (kept in sync via triggers)';
COMMENT ON COLUMN public.user_unread_counters.unread_count IS 'Number of unread direct messages across all conversations';
COMMENT ON COLUMN public.user_unread_counters.updated_at IS 'Timestamp of the most recent counter change';

-- Backfill existing counts from the legacy aggregate view if available
INSERT INTO public.user_unread_counters (user_id, unread_count, updated_at)
SELECT user_id, COALESCE(unread_count, 0), timezone('utc', now())
FROM public.user_unread_counts
ON CONFLICT (user_id) DO UPDATE
  SET unread_count = EXCLUDED.unread_count,
      updated_at = EXCLUDED.updated_at;

ALTER TABLE public.user_unread_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their unread counter" ON public.user_unread_counters;
CREATE POLICY "Users can select their unread counter"
  ON public.user_unread_counters
  FOR SELECT
  USING (user_id = auth.uid());

GRANT SELECT ON public.user_unread_counters TO authenticated;

-- =========================================================================
-- Replace legacy unread views with lightweight wrappers around the table
-- =========================================================================
DROP VIEW IF EXISTS public.user_unread_counts_secure;
DROP VIEW IF EXISTS public.user_unread_counts;

CREATE OR REPLACE VIEW public.user_unread_counts AS
SELECT user_id, unread_count, updated_at
FROM public.user_unread_counters;

CREATE OR REPLACE VIEW public.user_unread_counts_secure AS
SELECT user_id, unread_count, updated_at
FROM public.user_unread_counters
WHERE user_id = auth.uid();

COMMENT ON VIEW public.user_unread_counts IS 'Materialized unread counts per user (wrapper over user_unread_counters)';
COMMENT ON VIEW public.user_unread_counts_secure IS 'RLS wrapper exposing unread counts for the currently authenticated user';

GRANT SELECT ON public.user_unread_counts TO authenticated;
GRANT SELECT ON public.user_unread_counts_secure TO authenticated;

-- =========================================================================
-- Helper to locate the recipient for a given message row
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_message_recipient(p_conversation_id UUID, p_sender_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
           WHEN c.participant_one_id = p_sender_id THEN c.participant_two_id
           ELSE c.participant_one_id
         END AS recipient_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;
$$;

-- =========================================================================
-- Triggers to maintain unread counters
-- =========================================================================
CREATE OR REPLACE FUNCTION public.increment_unread_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_id UUID;
  now_ts TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF NEW.read_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  recipient_id := public.get_message_recipient(NEW.conversation_id, NEW.sender_id);

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_unread_counters AS counters (user_id, unread_count, updated_at)
  VALUES (recipient_id, 1, now_ts)
  ON CONFLICT (user_id) DO UPDATE
    SET unread_count = GREATEST(0, counters.unread_count + 1),
        updated_at = now_ts;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_unread_counter_on_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_id UUID;
  now_ts TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF NOT (OLD.read_at IS NULL AND NEW.read_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  recipient_id := public.get_message_recipient(NEW.conversation_id, NEW.sender_id);

  IF recipient_id IS NULL OR recipient_id = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.user_unread_counters
     SET unread_count = GREATEST(0, unread_count - 1),
         updated_at = now_ts
   WHERE user_id = recipient_id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_unread_counter_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient_id UUID;
  now_ts TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF OLD.read_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  recipient_id := public.get_message_recipient(OLD.conversation_id, OLD.sender_id);

  IF recipient_id IS NULL OR recipient_id = OLD.sender_id THEN
    RETURN OLD;
  END IF;

  UPDATE public.user_unread_counters
     SET unread_count = GREATEST(0, unread_count - 1),
         updated_at = now_ts
   WHERE user_id = recipient_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS message_increment_unread_counter ON public.messages;
CREATE TRIGGER message_increment_unread_counter
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_unread_counter();

DROP TRIGGER IF EXISTS message_decrement_unread_counter ON public.messages;
CREATE TRIGGER message_decrement_unread_counter
  AFTER UPDATE OF read_at ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_unread_counter_on_read();

DROP TRIGGER IF EXISTS message_cleanup_unread_counter ON public.messages;
CREATE TRIGGER message_cleanup_unread_counter
  AFTER DELETE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_unread_counter_on_delete();

-- =========================================================================
-- Ensure realtime broadcasts include the new table
-- =========================================================================
DO $$
BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_unread_counters';
EXCEPTION WHEN duplicate_object THEN
  NULL;
END;
$$;

COMMIT;
