-- ============================================================================
-- Admin Feature Usage Analytics
-- ============================================================================
-- Provides metrics on profile views, feature usage, and event tracking.
-- Queries the existing `events` table populated by track_event() RPC.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- admin_get_feature_usage_metrics(p_days, p_exclude_test)
-- ============================================================================
-- Returns comprehensive feature usage analytics from the events table.

CREATE OR REPLACE FUNCTION public.admin_get_feature_usage_metrics(
  p_days INT DEFAULT 30,
  p_exclude_test BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
  v_profile_views JSONB;
  v_most_viewed JSONB;
  v_view_trend JSONB;
  v_event_summary JSONB;
BEGIN
  -- Admin-only check
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Profile View Stats ──────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total', COALESCE(COUNT(*), 0),
    'unique_profiles_viewed', COALESCE(COUNT(DISTINCT e.entity_id), 0),
    'unique_viewers', COALESCE(COUNT(DISTINCT e.user_id), 0),
    'by_viewed_role', COALESCE((
      SELECT jsonb_object_agg(role, cnt)
      FROM (
        SELECT e2.properties->>'viewed_role' AS role, COUNT(*) AS cnt
        FROM events e2
        LEFT JOIN profiles p2 ON p2.id = e2.user_id
        WHERE e2.event_name = 'profile_view'
          AND e2.created_at >= v_since
          AND (NOT p_exclude_test OR COALESCE(p2.is_test_account, false) = false)
        GROUP BY e2.properties->>'viewed_role'
      ) sub
    ), '{}'::jsonb),
    'by_source', COALESCE((
      SELECT jsonb_object_agg(source, cnt)
      FROM (
        SELECT e3.properties->>'source' AS source, COUNT(*) AS cnt
        FROM events e3
        LEFT JOIN profiles p3 ON p3.id = e3.user_id
        WHERE e3.event_name = 'profile_view'
          AND e3.created_at >= v_since
          AND (NOT p_exclude_test OR COALESCE(p3.is_test_account, false) = false)
        GROUP BY e3.properties->>'source'
      ) sub
    ), '{}'::jsonb)
  )
  INTO v_profile_views
  FROM events e
  LEFT JOIN profiles p ON p.id = e.user_id
  WHERE e.event_name = 'profile_view'
    AND e.created_at >= v_since
    AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false);

  -- ── Most Viewed Profiles (top 20) ──────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.view_count DESC), '[]'::jsonb)
  INTO v_most_viewed
  FROM (
    SELECT
      e.entity_id AS profile_id,
      p.full_name,
      p.role,
      p.avatar_url,
      COUNT(*) AS view_count,
      COUNT(DISTINCT e.user_id) AS unique_viewers
    FROM events e
    JOIN profiles p ON p.id = e.entity_id
    LEFT JOIN profiles viewer ON viewer.id = e.user_id
    WHERE e.event_name = 'profile_view'
      AND e.entity_type = 'profile'
      AND e.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(viewer.is_test_account, false) = false)
    GROUP BY e.entity_id, p.full_name, p.role, p.avatar_url
    ORDER BY COUNT(*) DESC
    LIMIT 20
  ) sub;

  -- ── Daily View Trend ────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.date), '[]'::jsonb)
  INTO v_view_trend
  FROM (
    SELECT
      e.created_at::date AS date,
      COUNT(*) AS views
    FROM events e
    LEFT JOIN profiles p ON p.id = e.user_id
    WHERE e.event_name = 'profile_view'
      AND e.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    GROUP BY e.created_at::date
    ORDER BY e.created_at::date
  ) sub;

  -- ── All Events Summary ──────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.count DESC), '[]'::jsonb)
  INTO v_event_summary
  FROM (
    SELECT
      e.event_name,
      COUNT(*) AS count,
      COUNT(DISTINCT e.user_id) AS unique_users
    FROM events e
    LEFT JOIN profiles p ON p.id = e.user_id
    WHERE e.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    GROUP BY e.event_name
    ORDER BY COUNT(*) DESC
  ) sub;

  RETURN jsonb_build_object(
    'profile_views', v_profile_views,
    'most_viewed_profiles', v_most_viewed,
    'view_trend', v_view_trend,
    'event_summary', v_event_summary,
    'period_days', p_days,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_feature_usage_metrics TO authenticated;
