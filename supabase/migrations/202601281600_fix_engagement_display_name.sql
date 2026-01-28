-- ============================================================================
-- FIX USER ENGAGEMENT FUNCTION - COLUMN NAME
-- ============================================================================
-- The function uses p.display_name and p.first_name || ' ' || p.last_name
-- but the profiles table uses p.full_name
-- ============================================================================

SET search_path = public;

-- Fix admin_get_user_engagement
CREATE OR REPLACE FUNCTION public.admin_get_user_engagement(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_sort_by TEXT DEFAULT 'total_time',
  p_sort_dir TEXT DEFAULT 'desc',
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  role TEXT,
  avatar_url TEXT,
  total_time_minutes NUMERIC,
  active_days INTEGER,
  total_sessions INTEGER,
  last_active_at TIMESTAMPTZ,
  avg_session_minutes NUMERIC,
  total_count BIGINT
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
  WITH engagement_agg AS (
    SELECT
      ued.user_id,
      COALESCE(SUM(ued.total_seconds) / 60.0, 0) as total_time_minutes,
      COUNT(DISTINCT ued.date) as active_days,
      COALESCE(SUM(ued.session_count), 0) as total_sessions,
      MAX(ued.last_heartbeat_at) as last_active_at
    FROM user_engagement_daily ued
    WHERE ued.date > CURRENT_DATE - p_days
    GROUP BY ued.user_id
  ),
  user_engagement AS (
    SELECT
      p.id as user_id,
      -- FIXED: use full_name instead of display_name/first_name/last_name
      COALESCE(p.full_name, 'Unknown') as display_name,
      p.email,
      p.role,
      p.avatar_url,
      COALESCE(ea.total_time_minutes, 0) as total_time_minutes,
      COALESCE(ea.active_days::INTEGER, 0) as active_days,
      COALESCE(ea.total_sessions::INTEGER, 0) as total_sessions,
      ea.last_active_at,
      CASE
        WHEN COALESCE(ea.total_sessions, 0) > 0
        THEN ROUND(COALESCE(ea.total_time_minutes, 0) / ea.total_sessions, 1)
        ELSE 0
      END as avg_session_minutes,
      COUNT(*) OVER() as total_count
    FROM profiles p
    LEFT JOIN engagement_agg ea ON ea.user_id = p.id
    WHERE NOT p.is_test_account
  )
  SELECT
    ue.user_id,
    ue.display_name,
    ue.email,
    ue.role,
    ue.avatar_url,
    ue.total_time_minutes,
    ue.active_days,
    ue.total_sessions,
    ue.last_active_at,
    ue.avg_session_minutes,
    ue.total_count
  FROM user_engagement ue
  ORDER BY
    CASE WHEN p_sort_by = 'total_time' AND p_sort_dir = 'desc' THEN ue.total_time_minutes END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'total_time' AND p_sort_dir = 'asc' THEN ue.total_time_minutes END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'active_days' AND p_sort_dir = 'desc' THEN ue.active_days END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'active_days' AND p_sort_dir = 'asc' THEN ue.active_days END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'sessions' AND p_sort_dir = 'desc' THEN ue.total_sessions END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'sessions' AND p_sort_dir = 'asc' THEN ue.total_sessions END ASC NULLS LAST,
    CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'desc' THEN ue.last_active_at END DESC NULLS LAST,
    CASE WHEN p_sort_by = 'last_active' AND p_sort_dir = 'asc' THEN ue.last_active_at END ASC NULLS LAST,
    ue.display_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION admin_get_user_engagement IS
  'Returns per-user engagement metrics for admin reporting';
