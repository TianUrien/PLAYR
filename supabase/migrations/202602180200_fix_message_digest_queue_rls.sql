-- Enable RLS on message_digest_queue to satisfy Supabase Security Advisor.
-- This table is only accessed by:
--   1. enqueue_message_digests() — SECURITY DEFINER function (bypasses RLS)
--   2. notify-message-digest edge function — service role key (bypasses RLS)
-- A deny-all policy ensures no regular user can access this internal queue.

ALTER TABLE public.message_digest_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny all user access"
  ON public.message_digest_queue
  FOR ALL
  USING (false);
