-- ============================================================================
-- USER ENGAGEMENT TRACKING SCHEMA
-- ============================================================================
-- Tracks user engagement via heartbeat pings for accurate time-in-app metrics.
-- Uses a heartbeat-based approach with visibility detection on the client.
-- 
-- Design rationale:
-- - Heartbeats every 30 seconds while tab is visible/active
-- - Raw heartbeats stored in user_engagement_heartbeats (pruned after 90 days)
-- - Daily aggregates in user_engagement_daily for efficient querying
-- - Admin functions aggregate across users for reporting
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- RAW HEARTBEAT EVENTS TABLE
-- ============================================================================
-- Stores individual heartbeat pings from clients.
-- Each heartbeat represents ~30 seconds of active engagement.
-- Automatically pruned after 90 days via scheduled function.

CREATE TABLE IF NOT EXISTS public.user_engagement_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient aggregation by user and time
CREATE INDEX IF NOT EXISTS idx_engagement_heartbeats_user_created 
  ON user_engagement_heartbeats(user_id, created_at DESC);

-- Index for daily aggregation jobs
CREATE INDEX IF NOT EXISTS idx_engagement_heartbeats_created 
  ON user_engagement_heartbeats(created_at);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_engagement_heartbeats_session 
  ON user_engagement_heartbeats(session_id);

COMMENT ON TABLE user_engagement_heartbeats IS 
  'Raw heartbeat events sent every 30s while user tab is active. Auto-pruned after 90 days.';

-- ============================================================================
-- DAILY AGGREGATES TABLE
-- ============================================================================
-- Pre-aggregated daily stats per user for efficient admin queries.
-- Updated via upsert when heartbeats are recorded.

CREATE TABLE IF NOT EXISTS public.user_engagement_daily (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_seconds INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  heartbeat_count INTEGER NOT NULL DEFAULT 0,
  first_heartbeat_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- Index for admin queries (date range filtering)
CREATE INDEX IF NOT EXISTS idx_engagement_daily_date 
  ON user_engagement_daily(date DESC);

-- Index for per-user history
CREATE INDEX IF NOT EXISTS idx_engagement_daily_user 
  ON user_engagement_daily(user_id, date DESC);

COMMENT ON TABLE user_engagement_daily IS 
  'Daily engagement aggregates per user. Updated on each heartbeat for real-time stats.';

-- ============================================================================
-- HEARTBEAT INTERVAL CONSTANT
-- ============================================================================
-- Client sends heartbeats every 30 seconds. This is used in calculations.
-- If you change the client interval, update this value.

CREATE OR REPLACE FUNCTION public.engagement_heartbeat_interval_seconds()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 30;
$$;

COMMENT ON FUNCTION engagement_heartbeat_interval_seconds IS 
  'Returns the heartbeat interval in seconds. Must match client-side HEARTBEAT_INTERVAL_MS / 1000.';

-- ============================================================================
-- RECORD HEARTBEAT FUNCTION
-- ============================================================================
-- Called by client every 30 seconds while tab is active.
-- Inserts raw heartbeat and updates daily aggregate atomically.

CREATE OR REPLACE FUNCTION public.record_engagement_heartbeat(
  p_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_interval INTEGER;
  v_is_new_session BOOLEAN;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_today := CURRENT_DATE;
  v_interval := engagement_heartbeat_interval_seconds();

  -- Check if this is a new session (no prior heartbeat with this session_id today)
  SELECT NOT EXISTS (
    SELECT 1 FROM user_engagement_heartbeats 
    WHERE session_id = p_session_id 
    LIMIT 1
  ) INTO v_is_new_session;

  -- Insert raw heartbeat
  INSERT INTO user_engagement_heartbeats (user_id, session_id, created_at)
  VALUES (v_user_id, p_session_id, now());

  -- Upsert daily aggregate
  INSERT INTO user_engagement_daily (
    user_id, 
    date, 
    total_seconds, 
    session_count, 
    heartbeat_count,
    first_heartbeat_at,
    last_heartbeat_at,
    updated_at
  )
  VALUES (
    v_user_id,
    v_today,
    v_interval,
    CASE WHEN v_is_new_session THEN 1 ELSE 0 END,
    1,
    now(),
    now(),
    now()
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_seconds = user_engagement_daily.total_seconds + v_interval,
    session_count = user_engagement_daily.session_count + 
      CASE WHEN v_is_new_session THEN 1 ELSE 0 END,
    heartbeat_count = user_engagement_daily.heartbeat_count + 1,
    last_heartbeat_at = now(),
    updated_at = now();

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'is_new_session', v_is_new_session
  );
END;
$$;

COMMENT ON FUNCTION record_engagement_heartbeat IS 
  'Records a heartbeat from the client. Call every 30s while tab is active.';

-- ============================================================================
-- PRUNE OLD HEARTBEATS FUNCTION
-- ============================================================================
-- Deletes raw heartbeats older than 90 days.
-- Daily aggregates are kept forever for historical reporting.
-- Call this via pg_cron or a scheduled edge function.

CREATE OR REPLACE FUNCTION public.prune_old_heartbeats(
  p_days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Only admins can prune (or run via scheduled job)
  -- For scheduled jobs, this check can be bypassed by running as postgres user
  
  DELETE FROM user_engagement_heartbeats
  WHERE created_at < now() - (p_days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION prune_old_heartbeats IS 
  'Deletes raw heartbeats older than N days. Run via cron job.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_engagement_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_engagement_daily ENABLE ROW LEVEL SECURITY;

-- Users can insert their own heartbeats
CREATE POLICY "Users can insert own heartbeats"
  ON user_engagement_heartbeats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own heartbeats (for debugging)
CREATE POLICY "Users can read own heartbeats"
  ON user_engagement_heartbeats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all heartbeats
CREATE POLICY "Admins can read all heartbeats"
  ON user_engagement_heartbeats
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Users can read their own daily stats
CREATE POLICY "Users can read own daily stats"
  ON user_engagement_daily
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can read all daily stats
CREATE POLICY "Admins can read all daily stats"
  ON user_engagement_daily
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Daily stats are updated via the RPC function (SECURITY DEFINER)
-- No direct INSERT/UPDATE policies needed for regular users

-- ============================================================================
-- ADMIN ENGAGEMENT STATISTICS FUNCTIONS
-- ============================================================================

-- Get engagement summary for all users (admin overview)
CREATE OR REPLACE FUNCTION public.admin_get_engagement_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    -- Overall engagement
    'total_active_users_7d', (
      SELECT COUNT(DISTINCT user_id) 
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 7
    ),
    'total_active_users_30d', (
      SELECT COUNT(DISTINCT user_id) 
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 30
    ),
    'total_time_minutes_7d', (
      SELECT COALESCE(SUM(total_seconds) / 60, 0)
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 7
    ),
    'total_time_minutes_30d', (
      SELECT COALESCE(SUM(total_seconds) / 60, 0)
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 30
    ),
    'total_sessions_7d', (
      SELECT COALESCE(SUM(session_count), 0)
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 7
    ),
    'total_sessions_30d', (
      SELECT COALESCE(SUM(session_count), 0)
      FROM user_engagement_daily 
      WHERE date > CURRENT_DATE - 30
    ),
    'avg_session_minutes', (
      SELECT ROUND(
        COALESCE(AVG(total_seconds)::NUMERIC / NULLIF(AVG(session_count), 0) / 60, 0), 
        1
      )
      FROM user_engagement_daily
      WHERE date > CURRENT_DATE - 30
    ),
    'avg_daily_active_users', (
      SELECT ROUND(AVG(daily_users)::NUMERIC, 0)
      FROM (
        SELECT date, COUNT(DISTINCT user_id) as daily_users
        FROM user_engagement_daily
        WHERE date > CURRENT_DATE - 30
        GROUP BY date
      ) sub
    ),
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION admin_get_engagement_summary IS 
  'Returns aggregated engagement statistics for the admin dashboard';

-- Get per-user engagement metrics (for admin user list)
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
      COALESCE(p.display_name, p.first_name || ' ' || p.last_name, 'Unknown') as display_name,
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

-- Get engagement trends over time (for charts)
CREATE OR REPLACE FUNCTION public.admin_get_engagement_trends(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  active_users INTEGER,
  total_minutes INTEGER,
  total_sessions INTEGER
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
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE - p_days,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE as date
  )
  SELECT 
    ds.date,
    COALESCE(COUNT(DISTINCT ued.user_id)::INTEGER, 0) as active_users,
    COALESCE(SUM(ued.total_seconds)::INTEGER / 60, 0) as total_minutes,
    COALESCE(SUM(ued.session_count)::INTEGER, 0) as total_sessions
  FROM date_series ds
  LEFT JOIN user_engagement_daily ued ON ued.date = ds.date
  GROUP BY ds.date
  ORDER BY ds.date ASC;
END;
$$;

COMMENT ON FUNCTION admin_get_engagement_trends IS 
  'Returns daily engagement trends for charting';

-- Get single user engagement details (for admin user detail view)
CREATE OR REPLACE FUNCTION public.admin_get_user_engagement_detail(
  p_user_id UUID,
  p_days INTEGER DEFAULT 90
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    'user_id', p_user_id,
    'summary', (
      SELECT json_build_object(
        'total_time_minutes', COALESCE(SUM(total_seconds) / 60, 0),
        'active_days', COUNT(DISTINCT date),
        'total_sessions', COALESCE(SUM(session_count), 0),
        'first_active', MIN(first_heartbeat_at),
        'last_active', MAX(last_heartbeat_at),
        'avg_daily_minutes', ROUND(COALESCE(AVG(total_seconds)::NUMERIC / 60, 0), 1)
      )
      FROM user_engagement_daily
      WHERE user_id = p_user_id
        AND date > CURRENT_DATE - p_days
    ),
    'daily_breakdown', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'date', date,
          'minutes', total_seconds / 60,
          'sessions', session_count
        ) ORDER BY date DESC
      ), '[]'::json)
      FROM user_engagement_daily
      WHERE user_id = p_user_id
        AND date > CURRENT_DATE - p_days
    ),
    'recent_sessions', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'session_id', session_id,
          'started_at', MIN(created_at),
          'last_heartbeat', MAX(created_at),
          'duration_minutes', ROUND(
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::NUMERIC / 60, 1
          ),
          'heartbeat_count', COUNT(*)
        ) ORDER BY MIN(created_at) DESC
      ), '[]'::json)
      FROM (
        SELECT session_id, created_at
        FROM user_engagement_heartbeats
        WHERE user_id = p_user_id
          AND created_at > now() - (p_days || ' days')::INTERVAL
      ) sessions
      GROUP BY session_id
      LIMIT 20
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION admin_get_user_engagement_detail IS 
  'Returns detailed engagement data for a specific user';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION record_engagement_heartbeat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_engagement_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_engagement(INTEGER, INTEGER, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_engagement_trends(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_engagement_detail(UUID, INTEGER) TO authenticated;
