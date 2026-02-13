-- ============================================================================
-- Message Email Digest System
-- ============================================================================
-- Adds a scheduled digest email for unread messages. Instead of emailing per
-- message, pg_cron runs every 30 minutes and identifies users who:
--   1. Have unread message notifications (not yet emailed)
--   2. Haven't received a digest email in the last 6 hours
--   3. Are not currently active on the platform (no heartbeat in 5 min)
--   4. Have notify_messages = true
--   5. Are not test accounts
--
-- Eligible users get a row in message_digest_queue, which fires a database
-- webhook → edge function that renders and sends the digest email via Resend.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- A. Add notify_messages preference to profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.notify_messages
  IS 'Whether the user wants email digests for unread messages. Max one email per 6 hours.';

-- ============================================================================
-- B. Add last_message_email_at cooldown tracker to profiles
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_message_email_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.last_message_email_at
  IS 'When the last message digest email was sent to this user. Used for 6-hour cooldown.';

-- ============================================================================
-- C. Add emailed_at to profile_notifications
-- ============================================================================

ALTER TABLE public.profile_notifications
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profile_notifications.emailed_at
  IS 'When this notification was included in a digest email. NULL = not yet emailed.';

-- ============================================================================
-- D. Create message_digest_queue table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_digest_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  batch_ts TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  notification_ids UUID[] NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.message_digest_queue
  IS 'Queue for message digest emails. pg_cron inserts rows; webhook fires edge function to send email.';

CREATE INDEX IF NOT EXISTS idx_message_digest_queue_unprocessed
  ON public.message_digest_queue (created_at)
  WHERE processed_at IS NULL;

-- No RLS — accessed only by SECURITY DEFINER function and edge function (service role)

-- ============================================================================
-- E. Create enqueue_message_digests() function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_message_digests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_ts TIMESTAMPTZ := timezone('utc', now());
  v_user RECORD;
BEGIN
  -- Find users with unread, un-emailed message notifications
  -- who pass all eligibility checks
  FOR v_user IN
    SELECT
      pn.recipient_profile_id AS user_id,
      array_agg(pn.id) AS notif_ids
    FROM profile_notifications pn
    JOIN profiles p ON p.id = pn.recipient_profile_id
    WHERE pn.kind = 'message_received'
      AND pn.read_at IS NULL
      AND pn.cleared_at IS NULL
      AND pn.emailed_at IS NULL
      -- Preference: user opted in
      AND p.notify_messages = true
      -- Not a test account
      AND p.is_test_account = false
      -- Cooldown: no email in last 6 hours
      AND (p.last_message_email_at IS NULL
           OR p.last_message_email_at < v_batch_ts - interval '6 hours')
      -- Activity: not active in last 5 minutes
      -- Uses user_engagement_daily.last_heartbeat_at (heartbeats sent every 30s)
      AND NOT EXISTS (
        SELECT 1 FROM user_engagement_daily ued
        WHERE ued.user_id = pn.recipient_profile_id
          AND ued.date >= CURRENT_DATE
          AND ued.last_heartbeat_at > v_batch_ts - interval '5 minutes'
      )
    GROUP BY pn.recipient_profile_id
  LOOP
    -- Insert queue row (webhook fires edge function)
    INSERT INTO message_digest_queue (recipient_id, batch_ts, notification_ids)
    VALUES (v_user.user_id, v_batch_ts, v_user.notif_ids);

    -- Mark notifications as emailed
    UPDATE profile_notifications
    SET emailed_at = v_batch_ts
    WHERE id = ANY(v_user.notif_ids);

    -- Update cooldown timestamp
    UPDATE profiles
    SET last_message_email_at = v_batch_ts
    WHERE id = v_user.user_id;
  END LOOP;
END;
$$;

-- ============================================================================
-- F. Schedule pg_cron job — every 30 minutes
-- ============================================================================

SELECT cron.schedule(
  'message_digest_emails',
  '*/30 * * * *',
  'SELECT public.enqueue_message_digests();'
);
