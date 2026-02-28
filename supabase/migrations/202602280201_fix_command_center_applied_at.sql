-- Fix: opportunity_applications uses "applied_at" not "created_at"

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

  SELECT COUNT(*) INTO v_live_opps_prev
  FROM opportunities
  WHERE created_at <= v_period_start
    AND status IN ('open', 'closed')
    AND (closed_at IS NULL OR closed_at > v_period_start)
    AND (published_at IS NOT NULL AND published_at <= v_period_start);

  -- Applications in period vs previous period (uses applied_at, not created_at)
  SELECT COUNT(*) INTO v_apps_period
  FROM opportunity_applications
  WHERE applied_at > v_period_start;

  SELECT COUNT(*) INTO v_apps_prev
  FROM opportunity_applications
  WHERE applied_at > v_prev_start AND applied_at <= v_period_start;

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
