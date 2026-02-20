-- =============================================================================
-- Web Push Notifications
--
-- Adds push notification infrastructure:
--   1. push_subscriptions table (stores browser push subscription per device)
--   2. RLS policies (users manage own subscriptions)
--   3. notify_push preference on profiles
--
-- The send-push edge function is triggered via Supabase Database Webhook
-- configured in the Dashboard (INSERT on profile_notifications).
-- =============================================================================

-- 1. Push subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(profile_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_profile ON push_subscriptions(profile_id);

-- 2. RLS: users manage own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

-- 3. Push preference on profiles (default enabled)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  notify_push BOOLEAN NOT NULL DEFAULT true;

-- 4. Grant realtime publication for push_subscriptions (so we can listen for changes if needed)
ALTER PUBLICATION supabase_realtime ADD TABLE push_subscriptions;

NOTIFY pgrst, 'reload schema';
