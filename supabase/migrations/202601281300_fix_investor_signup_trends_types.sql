-- ============================================================================
-- FIX INVESTOR SIGNUP TRENDS TYPE MISMATCH
-- ============================================================================
-- The function returns BIGINT columns but COALESCE with literal 0 returns
-- integer. Explicitly cast to BIGINT to match the declared return type.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. FIX ADMIN: GET INVESTOR SIGNUP TRENDS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_investor_signup_trends(
  p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  date DATE,
  total_signups BIGINT,
  cumulative_total BIGINT,
  players BIGINT,
  coaches BIGINT,
  clubs BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH daily_signups AS (
    SELECT
      d.date::DATE AS signup_date,
      COUNT(p.id)::BIGINT AS daily_total,
      COUNT(p.id) FILTER (WHERE p.role = 'player')::BIGINT AS daily_players,
      COUNT(p.id) FILTER (WHERE p.role = 'coach')::BIGINT AS daily_coaches,
      COUNT(p.id) FILTER (WHERE p.role = 'club')::BIGINT AS daily_clubs
    FROM generate_series(
      (now() - (p_days || ' days')::INTERVAL)::DATE,
      now()::DATE,
      '1 day'::INTERVAL
    ) AS d(date)
    LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
    GROUP BY d.date
  )
  SELECT
    ds.signup_date AS date,
    ds.daily_total AS total_signups,
    SUM(ds.daily_total) OVER (ORDER BY ds.signup_date)::BIGINT AS cumulative_total,
    ds.daily_players AS players,
    ds.daily_coaches AS coaches,
    ds.daily_clubs AS clubs
  FROM daily_signups ds
  ORDER BY ds.signup_date ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_investor_signup_trends IS 'Returns daily signup trends with cumulative totals for charts';

-- ============================================================================
-- 2. FIX PUBLIC: GET INVESTOR SIGNUP TRENDS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.public_get_investor_signup_trends(
  p_token TEXT,
  p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  date DATE,
  total_signups BIGINT,
  cumulative_total BIGINT,
  players BIGINT,
  coaches BIGINT,
  clubs BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record investor_share_tokens;
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM investor_share_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now());

  IF v_token_record.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  -- Return trends data
  RETURN QUERY
  WITH daily_signups AS (
    SELECT
      d.date::DATE AS signup_date,
      COUNT(p.id)::BIGINT AS daily_total,
      COUNT(p.id) FILTER (WHERE p.role = 'player')::BIGINT AS daily_players,
      COUNT(p.id) FILTER (WHERE p.role = 'coach')::BIGINT AS daily_coaches,
      COUNT(p.id) FILTER (WHERE p.role = 'club')::BIGINT AS daily_clubs
    FROM generate_series(
      (now() - (p_days || ' days')::INTERVAL)::DATE,
      now()::DATE,
      '1 day'::INTERVAL
    ) AS d(date)
    LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
    GROUP BY d.date
  )
  SELECT
    ds.signup_date AS date,
    ds.daily_total AS total_signups,
    SUM(ds.daily_total) OVER (ORDER BY ds.signup_date)::BIGINT AS cumulative_total,
    ds.daily_players AS players,
    ds.daily_coaches AS coaches,
    ds.daily_clubs AS clubs
  FROM daily_signups ds
  ORDER BY ds.signup_date ASC;
END;
$$;

COMMENT ON FUNCTION public.public_get_investor_signup_trends IS 'Returns daily signup trends via shareable token (no auth required)';
