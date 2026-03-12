-- ============================================================================
-- Discovery Analytics
-- ============================================================================
-- Dedicated table for tracking AI Discovery (nl-search) queries.
-- Logged server-side from the nl-search edge function.
-- Includes admin RPC for aggregated analytics.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- discovery_events table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.discovery_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role            TEXT,
  query_text      TEXT NOT NULL,
  intent          TEXT NOT NULL,
  parsed_filters  JSONB,
  result_count    INT NOT NULL DEFAULT 0,
  has_qualitative BOOLEAN DEFAULT false,
  llm_provider    TEXT,
  response_time_ms INT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.discovery_events IS 'Tracks every AI Discovery query for admin analytics';

-- Indexes
CREATE INDEX IF NOT EXISTS discovery_events_user_id_idx
  ON public.discovery_events (user_id);

CREATE INDEX IF NOT EXISTS discovery_events_intent_idx
  ON public.discovery_events (intent);

CREATE INDEX IF NOT EXISTS discovery_events_created_at_idx
  ON public.discovery_events (created_at DESC);

CREATE INDEX IF NOT EXISTS discovery_events_zero_results_idx
  ON public.discovery_events (result_count)
  WHERE result_count = 0;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.discovery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on discovery_events"
  ON public.discovery_events FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins can read discovery_events"
  ON public.discovery_events FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- ============================================================================
-- admin_get_discovery_analytics(p_days, p_exclude_test)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_discovery_analytics(
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
  v_summary JSONB;
  v_intent_breakdown JSONB;
  v_filter_frequency JSONB;
  v_daily_trend JSONB;
  v_top_users JSONB;
  v_zero_result_queries JSONB;
  v_recent_queries JSONB;
BEGIN
  -- Admin-only check
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- ── Summary stats ─────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'total_queries', COALESCE(COUNT(*), 0),
    'unique_users', COALESCE(COUNT(DISTINCT de.user_id), 0),
    'avg_result_count', COALESCE(
      ROUND(AVG(de.result_count) FILTER (WHERE de.intent = 'search'), 1), 0
    ),
    'zero_result_queries', COALESCE(
      COUNT(*) FILTER (WHERE de.result_count = 0 AND de.intent = 'search'), 0
    ),
    'avg_response_time_ms', COALESCE(ROUND(AVG(de.response_time_ms)), 0),
    'error_count', COALESCE(
      COUNT(*) FILTER (WHERE de.error_message IS NOT NULL), 0
    )
  )
  INTO v_summary
  FROM discovery_events de
  LEFT JOIN profiles p ON p.id = de.user_id
  WHERE de.created_at >= v_since
    AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false);

  -- ── Intent breakdown ──────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.count DESC), '[]'::jsonb)
  INTO v_intent_breakdown
  FROM (
    SELECT
      de.intent,
      COUNT(*) AS count,
      ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER(), 0) * 100, 1) AS percentage
    FROM discovery_events de
    LEFT JOIN profiles p ON p.id = de.user_id
    WHERE de.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    GROUP BY de.intent
  ) sub;

  -- ── Filter frequency ──────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.count DESC), '[]'::jsonb)
  INTO v_filter_frequency
  FROM (
    SELECT filter_name, COUNT(*) AS count
    FROM (
      SELECT unnest(ARRAY[
        CASE WHEN de.parsed_filters->'roles' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'roles') > 0
             THEN 'roles' END,
        CASE WHEN de.parsed_filters->'positions' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'positions') > 0
             THEN 'positions' END,
        CASE WHEN de.parsed_filters->>'gender' IS NOT NULL
             AND de.parsed_filters->>'gender' != ''
             THEN 'gender' END,
        CASE WHEN (de.parsed_filters->>'min_age')::int IS NOT NULL
             OR (de.parsed_filters->>'max_age')::int IS NOT NULL
             THEN 'age' END,
        CASE WHEN de.parsed_filters->'nationalities' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'nationalities') > 0
             THEN 'nationalities' END,
        CASE WHEN de.parsed_filters->'locations' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'locations') > 0
             THEN 'locations' END,
        CASE WHEN de.parsed_filters->'leagues' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'leagues') > 0
             THEN 'leagues' END,
        CASE WHEN de.parsed_filters->'countries' IS NOT NULL
             AND jsonb_array_length(de.parsed_filters->'countries') > 0
             THEN 'countries' END,
        CASE WHEN (de.parsed_filters->>'eu_passport')::boolean = true
             THEN 'eu_passport' END,
        CASE WHEN de.parsed_filters->>'availability' IS NOT NULL
             AND de.parsed_filters->>'availability' != ''
             THEN 'availability' END,
        CASE WHEN (de.parsed_filters->>'min_references')::int > 0
             THEN 'references' END,
        CASE WHEN (de.parsed_filters->>'min_career_entries')::int > 0
             THEN 'career_entries' END,
        CASE WHEN de.parsed_filters->>'text_query' IS NOT NULL
             AND de.parsed_filters->>'text_query' != ''
             THEN 'text_query' END
      ]) AS filter_name
      FROM discovery_events de
      LEFT JOIN profiles p ON p.id = de.user_id
      WHERE de.intent = 'search'
        AND de.parsed_filters IS NOT NULL
        AND de.created_at >= v_since
        AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    ) expanded
    WHERE filter_name IS NOT NULL
    GROUP BY filter_name
  ) sub;

  -- ── Daily trend ───────────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.date), '[]'::jsonb)
  INTO v_daily_trend
  FROM (
    SELECT
      de.created_at::date AS date,
      COUNT(*) AS queries,
      COUNT(DISTINCT de.user_id) AS unique_users
    FROM discovery_events de
    LEFT JOIN profiles p ON p.id = de.user_id
    WHERE de.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    GROUP BY de.created_at::date
    ORDER BY de.created_at::date
  ) sub;

  -- ── Top users (max 50) ────────────────────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.query_count DESC), '[]'::jsonb)
  INTO v_top_users
  FROM (
    SELECT
      de.user_id,
      p.full_name AS display_name,
      p.email,
      p.role,
      p.avatar_url,
      COUNT(*) AS query_count,
      MAX(de.created_at) AS last_query_at
    FROM discovery_events de
    JOIN profiles p ON p.id = de.user_id
    WHERE de.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    GROUP BY de.user_id, p.full_name, p.email, p.role, p.avatar_url
    ORDER BY COUNT(*) DESC
    LIMIT 50
  ) sub;

  -- ── Zero-result queries (most recent 50) ──────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.created_at DESC), '[]'::jsonb)
  INTO v_zero_result_queries
  FROM (
    SELECT
      de.id,
      de.user_id,
      p.full_name AS display_name,
      de.query_text,
      de.parsed_filters,
      de.created_at
    FROM discovery_events de
    LEFT JOIN profiles p ON p.id = de.user_id
    WHERE de.intent = 'search'
      AND de.result_count = 0
      AND de.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    ORDER BY de.created_at DESC
    LIMIT 50
  ) sub;

  -- ── Recent queries (most recent 100) ──────────────────────────────────
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.created_at DESC), '[]'::jsonb)
  INTO v_recent_queries
  FROM (
    SELECT
      de.id,
      de.user_id,
      p.full_name AS display_name,
      de.role,
      de.query_text,
      de.intent,
      de.result_count,
      de.parsed_filters,
      de.response_time_ms,
      de.created_at
    FROM discovery_events de
    LEFT JOIN profiles p ON p.id = de.user_id
    WHERE de.created_at >= v_since
      AND (NOT p_exclude_test OR COALESCE(p.is_test_account, false) = false)
    ORDER BY de.created_at DESC
    LIMIT 100
  ) sub;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'intent_breakdown', v_intent_breakdown,
    'filter_frequency', v_filter_frequency,
    'daily_trend', v_daily_trend,
    'top_users', v_top_users,
    'zero_result_queries', v_zero_result_queries,
    'recent_queries', v_recent_queries,
    'period_days', p_days,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_discovery_analytics TO authenticated;
