-- Migration: Database-Backed Rate Limiting
-- Date: 2026-01-27
-- Description: Implements PostgreSQL-based rate limiting for authentication actions
--   - Sliding window rate limiting using a dedicated table
--   - Advisory locks to prevent race conditions
--   - Automatic cleanup of old entries
--   - Configurable limits per action type

SET search_path = public;

-- ============================================================================
-- RATE LIMITS TABLE
-- Stores rate limit records with IP, identifier, and action type
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,        -- IP address or user ID
  action_type TEXT NOT NULL,       -- 'login_attempt', 'signup', 'password_reset', 'apply'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Index for efficient lookups and cleanup
  CONSTRAINT rate_limits_identifier_action_idx UNIQUE (identifier, action_type, created_at)
);

-- Index for efficient time-based queries
CREATE INDEX IF NOT EXISTS rate_limits_lookup_idx
  ON public.rate_limits (identifier, action_type, created_at DESC);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS rate_limits_cleanup_idx
  ON public.rate_limits (created_at);

-- ============================================================================
-- RATE LIMIT CHECK FUNCTION
-- Checks if an action should be rate limited and records the attempt
-- Returns: { allowed: boolean, remaining: int, reset_at: timestamp }
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_max_requests INT DEFAULT 5,
  p_window_seconds INT DEFAULT 300  -- 5 minutes default
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INT;
  v_oldest_in_window TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
  v_allowed BOOLEAN;
  v_remaining INT;
BEGIN
  -- Calculate window start
  v_window_start := now() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Use advisory lock to prevent race conditions
  -- Hash based on identifier + action to scope the lock
  PERFORM pg_advisory_xact_lock(hashtext(p_identifier || ':' || p_action_type));

  -- Count requests in the current window
  SELECT COUNT(*), MIN(created_at)
  INTO v_current_count, v_oldest_in_window
  FROM public.rate_limits
  WHERE identifier = p_identifier
    AND action_type = p_action_type
    AND created_at > v_window_start;

  -- Calculate remaining requests and reset time
  v_remaining := GREATEST(0, p_max_requests - v_current_count);

  IF v_oldest_in_window IS NOT NULL THEN
    v_reset_at := v_oldest_in_window + (p_window_seconds || ' seconds')::INTERVAL;
  ELSE
    v_reset_at := now() + (p_window_seconds || ' seconds')::INTERVAL;
  END IF;

  -- Determine if request is allowed
  IF v_current_count >= p_max_requests THEN
    v_allowed := FALSE;
  ELSE
    v_allowed := TRUE;
    v_remaining := v_remaining - 1;

    -- Record this request
    INSERT INTO public.rate_limits (identifier, action_type, created_at)
    VALUES (p_identifier, p_action_type, now());
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'remaining', v_remaining,
    'reset_at', v_reset_at,
    'limit', p_max_requests
  );
END;
$$;

COMMENT ON FUNCTION public.check_rate_limit IS
  'Sliding window rate limiter. Returns JSON with allowed status, remaining requests, and reset timestamp.';

-- ============================================================================
-- RATE LIMIT CLEANUP FUNCTION
-- Removes old rate limit entries to prevent table bloat
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits(
  p_max_age_hours INT DEFAULT 24
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.rate_limits
  WHERE created_at < now() - (p_max_age_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_rate_limits IS
  'Removes rate limit entries older than specified hours. Run periodically via cron.';

-- ============================================================================
-- RLS POLICIES
-- Only service role can access rate_limits table directly
-- Users interact via the check_rate_limit function
-- ============================================================================

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No direct access for regular users
CREATE POLICY "Service role only"
  ON public.rate_limits
  FOR ALL
  USING (false);

-- Grant execute on functions to authenticated and anon (for pre-auth actions)
GRANT EXECUTE ON FUNCTION public.check_rate_limit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits TO service_role;

-- ============================================================================
-- CONVENIENCE WRAPPER FUNCTIONS FOR COMMON ACTIONS
-- Pre-configured limits for different action types
-- ============================================================================

-- Login attempts: 5 attempts per 15 minutes per IP
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_ip TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(p_ip, 'login_attempt', 5, 900);
$$;

-- Signup: 3 signups per hour per IP
CREATE OR REPLACE FUNCTION public.check_signup_rate_limit(p_ip TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(p_ip, 'signup', 3, 3600);
$$;

-- Password reset: 3 requests per hour per email
CREATE OR REPLACE FUNCTION public.check_password_reset_rate_limit(p_email TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(lower(p_email), 'password_reset', 3, 3600);
$$;

-- Opportunity application: 10 applications per hour per user
CREATE OR REPLACE FUNCTION public.check_application_rate_limit(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.check_rate_limit(p_user_id::TEXT, 'apply', 10, 3600);
$$;

GRANT EXECUTE ON FUNCTION public.check_login_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_password_reset_rate_limit TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_application_rate_limit TO authenticated;

COMMENT ON FUNCTION public.check_login_rate_limit IS 'Rate limit: 5 login attempts per 15 minutes per IP';
COMMENT ON FUNCTION public.check_signup_rate_limit IS 'Rate limit: 3 signups per hour per IP';
COMMENT ON FUNCTION public.check_password_reset_rate_limit IS 'Rate limit: 3 password reset requests per hour per email';
COMMENT ON FUNCTION public.check_application_rate_limit IS 'Rate limit: 10 opportunity applications per hour per user';
