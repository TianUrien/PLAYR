-- ============================================================================
-- INVESTOR DASHBOARD
-- ============================================================================
-- Tables and RPC functions for the investor metrics dashboard.
-- Supports both admin access and public shareable links.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. INVESTOR SHARE TOKENS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.investor_share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0
);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_investor_tokens_lookup
  ON investor_share_tokens(token)
  WHERE revoked_at IS NULL;

-- RLS: Only admins can access
ALTER TABLE investor_share_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage investor tokens"
  ON investor_share_tokens
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE investor_share_tokens IS 'Shareable tokens for public investor dashboard access';

-- ============================================================================
-- 2. ADMIN: GET INVESTOR METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_investor_metrics(
  p_days INTEGER DEFAULT 90
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metrics JSON;
  v_now TIMESTAMPTZ := now();
  v_period_start TIMESTAMPTZ := v_now - (p_days || ' days')::INTERVAL;
  v_prev_period_start TIMESTAMPTZ := v_period_start - (p_days || ' days')::INTERVAL;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    -- User totals (excluding test accounts)
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),

    -- Signups by period
    'signups_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '7 days' AND NOT is_test_account),
    'signups_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '30 days' AND NOT is_test_account),
    'signups_90d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '90 days' AND NOT is_test_account),

    -- Growth rates (current period vs previous period)
    'growth_rate_7d', (
      SELECT CASE
        WHEN prev_count = 0 THEN 100
        ELSE ROUND(((curr_count - prev_count)::NUMERIC / NULLIF(prev_count, 0)) * 100, 1)
      END
      FROM (
        SELECT
          (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '7 days' AND NOT is_test_account) as curr_count,
          (SELECT COUNT(*) FROM profiles WHERE created_at BETWEEN v_now - interval '14 days' AND v_now - interval '7 days' AND NOT is_test_account) as prev_count
      ) counts
    ),
    'growth_rate_30d', (
      SELECT CASE
        WHEN prev_count = 0 THEN 100
        ELSE ROUND(((curr_count - prev_count)::NUMERIC / NULLIF(prev_count, 0)) * 100, 1)
      END
      FROM (
        SELECT
          (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '30 days' AND NOT is_test_account) as curr_count,
          (SELECT COUNT(*) FROM profiles WHERE created_at BETWEEN v_now - interval '60 days' AND v_now - interval '30 days' AND NOT is_test_account) as prev_count
      ) counts
    ),

    -- Top countries
    'top_countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT
          p.country,
          COUNT(*) as user_count
        FROM profiles p
        WHERE p.country IS NOT NULL AND NOT p.is_test_account
        GROUP BY p.country
        ORDER BY COUNT(*) DESC
        LIMIT 10
      ) c
    ),

    -- Engagement signals
    'dau_7d_avg', (
      SELECT COALESCE(ROUND(AVG(daily_users)), 0)
      FROM (
        SELECT COUNT(DISTINCT user_id) as daily_users
        FROM user_engagement_daily
        WHERE date > (v_now - interval '7 days')::DATE
        GROUP BY date
      ) daily
    ),
    'total_messages_30d', (SELECT COUNT(*) FROM messages WHERE sent_at > v_now - interval '30 days'),
    'total_applications_30d', (SELECT COUNT(*) FROM vacancy_applications WHERE created_at > v_now - interval '30 days'),
    'total_opportunities', (SELECT COUNT(*) FROM vacancies WHERE status = 'open'),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_metrics;

  RETURN v_metrics;
END;
$$;

COMMENT ON FUNCTION public.admin_get_investor_metrics IS 'Returns investor dashboard metrics (admin only)';

-- ============================================================================
-- 3. ADMIN: GET INVESTOR SIGNUP TRENDS (for charts)
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
      d.date::DATE,
      COALESCE(COUNT(p.id), 0) AS daily_total,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'player'), 0) AS daily_players,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'coach'), 0) AS daily_coaches,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'club'), 0) AS daily_clubs
    FROM generate_series(
      (now() - (p_days || ' days')::INTERVAL)::DATE,
      now()::DATE,
      '1 day'::INTERVAL
    ) AS d(date)
    LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
    GROUP BY d.date
  )
  SELECT
    ds.date,
    ds.daily_total AS total_signups,
    SUM(ds.daily_total) OVER (ORDER BY ds.date) AS cumulative_total,
    ds.daily_players AS players,
    ds.daily_coaches AS coaches,
    ds.daily_clubs AS clubs
  FROM daily_signups ds
  ORDER BY ds.date ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_investor_signup_trends IS 'Returns daily signup trends with cumulative totals for charts';

-- ============================================================================
-- 4. ADMIN: CREATE INVESTOR TOKEN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_create_investor_token(
  p_name TEXT DEFAULT 'Default',
  p_expires_in_days INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_expires_at TIMESTAMPTZ;
  v_result investor_share_tokens;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Generate a secure random token (32 hex chars)
  v_token := encode(gen_random_bytes(16), 'hex');

  -- Calculate expiry if specified
  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := now() + (p_expires_in_days || ' days')::INTERVAL;
  END IF;

  -- Insert the token
  INSERT INTO investor_share_tokens (token, name, created_by, expires_at)
  VALUES (v_token, p_name, auth.uid(), v_expires_at)
  RETURNING * INTO v_result;

  -- Log to audit
  INSERT INTO admin_audit_logs (admin_id, action, target_type, details)
  VALUES (
    auth.uid(),
    'create_investor_token',
    'investor_token',
    jsonb_build_object('token_id', v_result.id, 'name', p_name)
  );

  RETURN row_to_json(v_result);
END;
$$;

COMMENT ON FUNCTION public.admin_create_investor_token IS 'Creates a new shareable investor dashboard token';

-- ============================================================================
-- 5. ADMIN: REVOKE INVESTOR TOKEN
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_revoke_investor_token(
  p_token_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Revoke the token
  UPDATE investor_share_tokens
  SET revoked_at = now()
  WHERE id = p_token_id AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Log to audit
  INSERT INTO admin_audit_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'revoke_investor_token',
    'investor_token',
    p_token_id,
    jsonb_build_object('token_id', p_token_id)
  );

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.admin_revoke_investor_token IS 'Revokes an investor dashboard token';

-- ============================================================================
-- 6. ADMIN: LIST INVESTOR TOKENS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_list_investor_tokens()
RETURNS TABLE (
  id UUID,
  token TEXT,
  name TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER,
  is_active BOOLEAN
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
  SELECT
    t.id,
    t.token,
    t.name,
    t.created_at,
    t.expires_at,
    t.revoked_at,
    t.last_accessed_at,
    t.access_count,
    (t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())) AS is_active
  FROM investor_share_tokens t
  ORDER BY t.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_list_investor_tokens IS 'Lists all investor dashboard tokens';

-- ============================================================================
-- 7. PUBLIC: GET INVESTOR METRICS (token-based access)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.public_get_investor_metrics(
  p_token TEXT,
  p_days INTEGER DEFAULT 90
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record investor_share_tokens;
  v_metrics JSON;
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM investor_share_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > v_now);

  IF v_token_record.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  -- Update access stats
  UPDATE investor_share_tokens
  SET
    last_accessed_at = v_now,
    access_count = access_count + 1
  WHERE id = v_token_record.id;

  -- Return metrics (same as admin version but without admin check)
  SELECT json_build_object(
    -- User totals (excluding test accounts)
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),

    -- Signups by period
    'signups_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '7 days' AND NOT is_test_account),
    'signups_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '30 days' AND NOT is_test_account),
    'signups_90d', (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '90 days' AND NOT is_test_account),

    -- Growth rates
    'growth_rate_7d', (
      SELECT CASE
        WHEN prev_count = 0 THEN 100
        ELSE ROUND(((curr_count - prev_count)::NUMERIC / NULLIF(prev_count, 0)) * 100, 1)
      END
      FROM (
        SELECT
          (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '7 days' AND NOT is_test_account) as curr_count,
          (SELECT COUNT(*) FROM profiles WHERE created_at BETWEEN v_now - interval '14 days' AND v_now - interval '7 days' AND NOT is_test_account) as prev_count
      ) counts
    ),
    'growth_rate_30d', (
      SELECT CASE
        WHEN prev_count = 0 THEN 100
        ELSE ROUND(((curr_count - prev_count)::NUMERIC / NULLIF(prev_count, 0)) * 100, 1)
      END
      FROM (
        SELECT
          (SELECT COUNT(*) FROM profiles WHERE created_at > v_now - interval '30 days' AND NOT is_test_account) as curr_count,
          (SELECT COUNT(*) FROM profiles WHERE created_at BETWEEN v_now - interval '60 days' AND v_now - interval '30 days' AND NOT is_test_account) as prev_count
      ) counts
    ),

    -- Top countries
    'top_countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT
          p.country,
          COUNT(*) as user_count
        FROM profiles p
        WHERE p.country IS NOT NULL AND NOT p.is_test_account
        GROUP BY p.country
        ORDER BY COUNT(*) DESC
        LIMIT 10
      ) c
    ),

    -- Engagement signals
    'dau_7d_avg', (
      SELECT COALESCE(ROUND(AVG(daily_users)), 0)
      FROM (
        SELECT COUNT(DISTINCT user_id) as daily_users
        FROM user_engagement_daily
        WHERE date > (v_now - interval '7 days')::DATE
        GROUP BY date
      ) daily
    ),
    'total_messages_30d', (SELECT COUNT(*) FROM messages WHERE sent_at > v_now - interval '30 days'),
    'total_applications_30d', (SELECT COUNT(*) FROM vacancy_applications WHERE created_at > v_now - interval '30 days'),
    'total_opportunities', (SELECT COUNT(*) FROM vacancies WHERE status = 'open'),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_metrics;

  RETURN v_metrics;
END;
$$;

COMMENT ON FUNCTION public.public_get_investor_metrics IS 'Returns investor dashboard metrics via shareable token (no auth required)';

-- ============================================================================
-- 8. PUBLIC: GET INVESTOR SIGNUP TRENDS (token-based access)
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
  v_now TIMESTAMPTZ := now();
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM investor_share_tokens
  WHERE token = p_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > v_now);

  IF v_token_record.id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired token';
  END IF;

  RETURN QUERY
  WITH daily_signups AS (
    SELECT
      d.date::DATE,
      COALESCE(COUNT(p.id), 0) AS daily_total,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'player'), 0) AS daily_players,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'coach'), 0) AS daily_coaches,
      COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'club'), 0) AS daily_clubs
    FROM generate_series(
      (v_now - (p_days || ' days')::INTERVAL)::DATE,
      v_now::DATE,
      '1 day'::INTERVAL
    ) AS d(date)
    LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
    GROUP BY d.date
  )
  SELECT
    ds.date,
    ds.daily_total AS total_signups,
    SUM(ds.daily_total) OVER (ORDER BY ds.date) AS cumulative_total,
    ds.daily_players AS players,
    ds.daily_coaches AS coaches,
    ds.daily_clubs AS clubs
  FROM daily_signups ds
  ORDER BY ds.date ASC;
END;
$$;

COMMENT ON FUNCTION public.public_get_investor_signup_trends IS 'Returns signup trends via shareable token (no auth required)';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.admin_get_investor_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_investor_signup_trends TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_investor_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_investor_token TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_investor_tokens TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_investor_metrics TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_investor_signup_trends TO anon, authenticated;
