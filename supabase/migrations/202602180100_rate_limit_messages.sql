-- ============================================================================
-- Migration: Rate Limit Message Sending
-- Date: 2026-02-18
-- Description: Adds a convenience RPC for rate limiting message sends using
--   the existing database-backed check_rate_limit() infrastructure (202601273000).
--   Limit: 30 messages per minute per user.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- CONVENIENCE WRAPPER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_message_rate_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(p_user_id::TEXT, 'send_message', 30, 60);
$$;

GRANT EXECUTE ON FUNCTION public.check_message_rate_limit TO authenticated;

COMMENT ON FUNCTION public.check_message_rate_limit IS 'Rate limit: 30 messages per minute per user';
