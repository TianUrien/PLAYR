-- ============================================================================
-- FIX INVESTOR METRICS - USE applied_at FOR opportunity_applications
-- ============================================================================
-- The opportunity_applications table uses 'applied_at' not 'created_at'.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. FIX ADMIN: GET INVESTOR METRICS
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

    -- Top countries (use nationality column)
    'top_countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT
          p.nationality as country,
          COUNT(*) as user_count
        FROM profiles p
        WHERE p.nationality IS NOT NULL AND NOT p.is_test_account
        GROUP BY p.nationality
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
    -- FIXED: use applied_at instead of created_at
    'total_applications_30d', (SELECT COUNT(*) FROM opportunity_applications WHERE applied_at > v_now - interval '30 days'),
    'total_opportunities', (SELECT COUNT(*) FROM opportunities WHERE status = 'open'),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_metrics;

  RETURN v_metrics;
END;
$$;

COMMENT ON FUNCTION public.admin_get_investor_metrics IS 'Returns investor dashboard metrics (admin only)';

-- ============================================================================
-- 2. FIX PUBLIC: GET INVESTOR METRICS
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

  -- Return metrics (use nationality column and applied_at)
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

    -- Top countries (use nationality column)
    'top_countries', (
      SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json)
      FROM (
        SELECT
          p.nationality as country,
          COUNT(*) as user_count
        FROM profiles p
        WHERE p.nationality IS NOT NULL AND NOT p.is_test_account
        GROUP BY p.nationality
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
    -- FIXED: use applied_at instead of created_at
    'total_applications_30d', (SELECT COUNT(*) FROM opportunity_applications WHERE applied_at > v_now - interval '30 days'),
    'total_opportunities', (SELECT COUNT(*) FROM opportunities WHERE status = 'open'),

    -- Metadata
    'period_days', p_days,
    'generated_at', v_now
  ) INTO v_metrics;

  RETURN v_metrics;
END;
$$;

COMMENT ON FUNCTION public.public_get_investor_metrics IS 'Returns investor dashboard metrics via shareable token (no auth required)';
