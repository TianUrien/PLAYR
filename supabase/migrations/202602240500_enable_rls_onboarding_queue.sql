-- Enable RLS on onboarding_reminder_queue
-- This is an internal queue table accessed only by pg_cron and edge functions
-- (both use service_role which bypasses RLS). No user-facing policies needed.
ALTER TABLE public.onboarding_reminder_queue ENABLE ROW LEVEL SECURITY;
