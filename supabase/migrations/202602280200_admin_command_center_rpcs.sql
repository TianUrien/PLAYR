-- ============================================================================
-- FOUNDER COMMAND CENTER RPCs
-- Provides KPIs, retention cohorts, activation funnel, and growth chart data
-- for the admin overview dashboard.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. admin_get_command_center(p_days) → JSON
--    Returns all KPIs for the founder command center overview.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_command_center(
  p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_period_start TIMESTAMPTZ;
  v_prev_start TIMESTAMPTZ;
  v_total_users BIGINT;
  v_total_users_prev BIGINT;
  v_mau BIGINT;
  v_wau BIGINT;
  v_dau BIGINT;
  v_live_opps BIGINT;
  v_live_opps_prev BIGINT;
  v_apps_period BIGINT;
  v_apps_prev BIGINT;
  v_vacancy_views BIGINT;
  v_profile_complete BIGINT;
  v_total_non_test BIGINT;
  v_d7_cohort_size BIGINT;
  v_d7_retained BIGINT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_period_start := now() - (p_days || ' days')::INTERVAL;
  v_prev_start := now() - (p_days * 2 || ' days')::INTERVAL;

  -- Total users (current vs previous period end)
  SELECT COUNT(*) INTO v_total_users
  FROM profiles WHERE NOT is_test_account;

  SELECT COUNT(*) INTO v_total_users_prev
  FROM profiles WHERE NOT is_test_account AND created_at <= v_period_start;

  -- DAU / WAU / MAU from engagement heartbeats
  SELECT COUNT(DISTINCT user_id) INTO v_mau
  FROM user_engagement_daily
  WHERE date > CURRENT_DATE - 30;

  SELECT COUNT(DISTINCT user_id) INTO v_wau
  FROM user_engagement_daily
  WHERE date > CURRENT_DATE - 7;

  SELECT COUNT(DISTINCT user_id) INTO v_dau
  FROM user_engagement_daily
  WHERE date = CURRENT_DATE;

  -- Live opportunities (current vs at start of period)
  SELECT COUNT(*) INTO v_live_opps
  FROM opportunities WHERE status = 'open';

  -- Approximate prev: opportunities that were open at period start
  -- (created before period start AND (not closed OR closed after period start))
  SELECT COUNT(*) INTO v_live_opps_prev
  FROM opportunities
  WHERE created_at <= v_period_start
    AND status IN ('open', 'closed')
    AND (closed_at IS NULL OR closed_at > v_period_start)
    AND (published_at IS NOT NULL AND published_at <= v_period_start);

  -- Applications in period vs previous period
  SELECT COUNT(*) INTO v_apps_period
  FROM opportunity_applications
  WHERE created_at > v_period_start;

  SELECT COUNT(*) INTO v_apps_prev
  FROM opportunity_applications
  WHERE created_at > v_prev_start AND created_at <= v_period_start;

  -- Vacancy views in period (for conversion rate)
  SELECT COUNT(*) INTO v_vacancy_views
  FROM events
  WHERE event_name = 'vacancy_view' AND created_at > v_period_start;

  -- Profile completion
  SELECT COUNT(*) INTO v_total_non_test
  FROM profiles WHERE NOT is_test_account;

  SELECT COUNT(*) INTO v_profile_complete
  FROM profiles
  WHERE NOT is_test_account
    AND avatar_url IS NOT NULL
    AND bio IS NOT NULL AND bio != '';

  -- D7 retention: users who signed up 8-14 days ago, how many were active on day 7-13
  SELECT COUNT(*) INTO v_d7_cohort_size
  FROM profiles
  WHERE NOT is_test_account
    AND created_at::DATE BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 8;

  SELECT COUNT(DISTINCT p.id) INTO v_d7_retained
  FROM profiles p
  JOIN user_engagement_daily ued ON ued.user_id = p.id
  WHERE NOT p.is_test_account
    AND p.created_at::DATE BETWEEN CURRENT_DATE - 14 AND CURRENT_DATE - 8
    AND ued.date BETWEEN p.created_at::DATE + 7 AND p.created_at::DATE + 13;

  SELECT json_build_object(
    'total_users', v_total_users,
    'total_users_prev', v_total_users_prev,
    'mau', v_mau,
    'wau', v_wau,
    'dau', v_dau,
    'wau_mau_ratio', CASE WHEN v_mau > 0 THEN ROUND(v_wau::NUMERIC / v_mau * 100, 1) ELSE 0 END,
    'live_opportunities', v_live_opps,
    'live_opportunities_prev', v_live_opps_prev,
    'applications_period', v_apps_period,
    'applications_prev', v_apps_prev,
    'application_conversion', CASE WHEN v_vacancy_views > 0
      THEN ROUND(v_apps_period::NUMERIC / v_vacancy_views * 100, 1)
      ELSE 0 END,
    'profile_completion_pct', CASE WHEN v_total_non_test > 0
      THEN ROUND(v_profile_complete::NUMERIC / v_total_non_test * 100, 1)
      ELSE 0 END,
    'role_distribution', (
      SELECT json_build_object(
        'player', COUNT(*) FILTER (WHERE role = 'player'),
        'coach', COUNT(*) FILTER (WHERE role = 'coach'),
        'club', COUNT(*) FILTER (WHERE role = 'club'),
        'brand', COUNT(*) FILTER (WHERE role = 'brand')
      ) FROM profiles WHERE NOT is_test_account
    ),
    'd7_retention', CASE WHEN v_d7_cohort_size > 0
      THEN ROUND(v_d7_retained::NUMERIC / v_d7_cohort_size * 100, 1)
      ELSE 0 END,
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================================
-- 2. admin_get_retention_cohorts(p_months) → TABLE
--    Returns D1/D7/D14/D30 retention by monthly signup cohort.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_retention_cohorts(
  p_months INTEGER DEFAULT 3
)
RETURNS TABLE (
  signup_month DATE,
  cohort_size INTEGER,
  d1_pct NUMERIC,
  d7_pct NUMERIC,
  d14_pct NUMERIC,
  d30_pct NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH cohorts AS (
    SELECT
      DATE_TRUNC('month', p.created_at)::DATE AS signup_month,
      p.id AS user_id,
      p.created_at::DATE AS signup_date
    FROM profiles p
    WHERE NOT p.is_test_account
      AND p.created_at >= DATE_TRUNC('month', now()) - (p_months || ' months')::INTERVAL
  ),
  retention AS (
    SELECT
      c.signup_month,
      c.user_id,
      EXISTS (
        SELECT 1 FROM user_engagement_daily ued
        WHERE ued.user_id = c.user_id AND ued.date = c.signup_date + 1
      ) AS retained_d1,
      EXISTS (
        SELECT 1 FROM user_engagement_daily ued
        WHERE ued.user_id = c.user_id AND ued.date BETWEEN c.signup_date + 7 AND c.signup_date + 13
      ) AS retained_d7,
      EXISTS (
        SELECT 1 FROM user_engagement_daily ued
        WHERE ued.user_id = c.user_id AND ued.date BETWEEN c.signup_date + 14 AND c.signup_date + 20
      ) AS retained_d14,
      EXISTS (
        SELECT 1 FROM user_engagement_daily ued
        WHERE ued.user_id = c.user_id AND ued.date BETWEEN c.signup_date + 28 AND c.signup_date + 34
      ) AS retained_d30
    FROM cohorts c
  )
  SELECT
    r.signup_month,
    COUNT(*)::INTEGER AS cohort_size,
    ROUND(COUNT(*) FILTER (WHERE r.retained_d1)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS d1_pct,
    ROUND(COUNT(*) FILTER (WHERE r.retained_d7)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS d7_pct,
    ROUND(COUNT(*) FILTER (WHERE r.retained_d14)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS d14_pct,
    ROUND(COUNT(*) FILTER (WHERE r.retained_d30)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS d30_pct
  FROM retention r
  GROUP BY r.signup_month
  ORDER BY r.signup_month DESC;
END;
$$;


-- ============================================================================
-- 3. admin_get_activation_funnel(p_days) → JSON
--    Cross-role activation funnel: signup → profile → browse → apply → message
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_activation_funnel(
  p_days INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_date_filter TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_date_filter := CASE
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ
    ELSE now() - (p_days || ' days')::INTERVAL
  END;

  SELECT json_build_object(
    'signed_up', (
      SELECT COUNT(*) FROM profiles
      WHERE NOT is_test_account AND created_at > v_date_filter
    ),
    'profile_complete', (
      SELECT COUNT(*) FROM profiles
      WHERE NOT is_test_account AND created_at > v_date_filter
        AND avatar_url IS NOT NULL
        AND bio IS NOT NULL AND bio != ''
    ),
    'browsed_opportunity', (
      SELECT COUNT(DISTINCT e.user_id) FROM events e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.event_name = 'vacancy_view'
        AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'applied', (
      SELECT COUNT(DISTINCT oa.applicant_id) FROM opportunity_applications oa
      JOIN profiles p ON p.id = oa.applicant_id
      WHERE NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'messaged', (
      SELECT COUNT(DISTINCT e.user_id) FROM events e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.event_name = 'message_send'
        AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ============================================================================
-- 4. admin_get_user_growth_chart(p_days) → TABLE
--    Daily new users + cumulative total for the growth chart.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_user_growth_chart(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  day DATE,
  new_users INTEGER,
  cumulative_total BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_count BIGINT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Count users before the window starts
  SELECT COUNT(*) INTO v_base_count
  FROM profiles
  WHERE NOT is_test_account
    AND created_at::DATE < CURRENT_DATE - p_days;

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(
      CURRENT_DATE - p_days,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily_signups AS (
    SELECT
      created_at::DATE AS signup_day,
      COUNT(*)::INTEGER AS cnt
    FROM profiles
    WHERE NOT is_test_account
    GROUP BY created_at::DATE
  )
  SELECT
    dr.day,
    COALESCE(ds.cnt, 0)::INTEGER AS new_users,
    (v_base_count + SUM(COALESCE(ds.cnt, 0)) OVER (ORDER BY dr.day))::BIGINT AS cumulative_total
  FROM date_range dr
  LEFT JOIN daily_signups ds ON ds.signup_day = dr.day
  ORDER BY dr.day;
END;
$$;


-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.admin_get_command_center(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_retention_cohorts(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_activation_funnel(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_growth_chart(INTEGER) TO authenticated;
