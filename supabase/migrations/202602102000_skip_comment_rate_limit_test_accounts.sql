-- ============================================================================
-- Migration: Skip Comment Rate Limit for Test Accounts
-- Date: 2026-02-10
-- Description: Updates enforce_post_comment_rate_limit() trigger to bypass
--   the 20 comments/24h rate limit for test accounts (is_test_account = true).
--   Same pattern as 202602101800 for user posts — prevents CI flakes from
--   rate limit accumulation across runs.
-- ============================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.enforce_post_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count INTEGER;
  v_is_test BOOLEAN;
BEGIN
  -- Skip rate limit for test accounts
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = NEW.author_id;

  IF v_is_test THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_recent_count
  FROM post_comments
  WHERE author_id = NEW.author_id
    AND created_at > (now() - interval '24 hours');

  IF v_recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 20 comments per 24 hours';
  END IF;

  RETURN NEW;
END;
$$;
