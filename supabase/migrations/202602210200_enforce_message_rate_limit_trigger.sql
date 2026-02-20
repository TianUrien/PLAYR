-- ============================================================================
-- Migration: Enforce Message Rate Limit via BEFORE INSERT Trigger
-- Date: 2026-02-21
-- Description: Adds server-side rate limiting on the messages table so that
--   limits cannot be bypassed via direct PostREST INSERT. Two-tier protection:
--   - Burst:        30 messages per minute per user (global)
--   - Conversation: 100 messages per hour per user per conversation
--   Skips test accounts to prevent CI flakes.
--   Uses advisory lock scoped to sender to prevent race conditions.
-- ============================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burst_limit   CONSTANT INTEGER  := 30;
  v_burst_window  CONSTANT INTERVAL := interval '1 minute';
  v_hourly_limit  CONSTANT INTEGER  := 100;
  v_hourly_window CONSTANT INTERVAL := interval '1 hour';
  v_burst_count   INTEGER;
  v_hourly_count  INTEGER;
  v_is_test       BOOLEAN;
BEGIN
  -- Skip for test accounts
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = NEW.sender_id;

  IF v_is_test THEN
    RETURN NEW;
  END IF;

  -- Advisory lock scoped to sender
  PERFORM pg_advisory_xact_lock(hashtext('msg_rate:' || NEW.sender_id::TEXT));

  -- Burst: 30 messages per minute per user
  SELECT COUNT(*) INTO v_burst_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND sent_at >= (timezone('utc', now()) - v_burst_window);

  IF v_burst_count >= v_burst_limit THEN
    RAISE EXCEPTION 'message_rate_limit_exceeded'
      USING DETAIL = format('Burst limit: %s messages per minute reached.', v_burst_limit);
  END IF;

  -- Conversation: 100 messages per hour per user per conversation
  SELECT COUNT(*) INTO v_hourly_count
  FROM messages
  WHERE sender_id = NEW.sender_id
    AND conversation_id = NEW.conversation_id
    AND sent_at >= (timezone('utc', now()) - v_hourly_window);

  IF v_hourly_count >= v_hourly_limit THEN
    RAISE EXCEPTION 'message_rate_limit_exceeded'
      USING DETAIL = format('Conversation limit: %s messages per hour reached.', v_hourly_limit);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_message_rate_limit IS
  'BEFORE INSERT trigger: 30 msg/min/user burst + 100 msg/hr/user/conversation. Skips test accounts.';

DROP TRIGGER IF EXISTS enforce_message_rate_limit ON public.messages;
CREATE TRIGGER enforce_message_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_message_rate_limit();
