-- =========================================================================
-- Profile search appearances analytics
-- =========================================================================
-- Logs one row per time a profile surfaced in an ACTIVE community search or
-- filter result — i.e. the viewer typed a query or narrowed beyond defaults.
-- Plain grid renders (no filters) are NOT logged, to keep this a meaningful
-- "people are actively looking for profiles like mine" signal.
--
-- Privacy design:
-- - `viewer_id` is stored for dedup ONLY. It is never exposed to the profile
--   owner. Direct SELECT is denied to all non-admins; owners read via the
--   SECURITY DEFINER RPC below, which returns aggregate-only counts.
-- - Self-appearances (viewer_id = profile_id) are rejected by CHECK.
-- - Anonymous viewers cannot log appearances (RLS requires authenticated +
--   auth.uid() = viewer_id).
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.profile_search_appearances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  -- Hour bucket for dedup: same viewer surfacing the same profile more than
  -- once within an hour counts as a single appearance.
  -- 3-arg date_trunc is IMMUTABLE (the 2-arg form with timestamptz is only STABLE,
  -- which Postgres rejects inside a STORED generated column). Forcing UTC also
  -- makes the bucket stable across session timezone changes.
  hour_bucket TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('hour', created_at, 'UTC')) STORED,

  CONSTRAINT profile_search_appearances_no_self CHECK (profile_id <> viewer_id)
);

COMMENT ON TABLE public.profile_search_appearances IS
  'Time-series log of profile appearances in active community search/filter results. Viewer identity is never exposed to the profile owner; reads go through get_profile_search_appearances().';

COMMENT ON COLUMN public.profile_search_appearances.filters IS
  'JSONB snapshot of the active filters at the time of the appearance. Keys used by v1: search_query_present (bool), role, position, location, availability, nationality.';

-- Dedup unique index — also enforces the "once per hour per viewer/profile" rule.
CREATE UNIQUE INDEX IF NOT EXISTS profile_search_appearances_dedup
  ON public.profile_search_appearances (profile_id, viewer_id, hour_bucket);

-- Dashboard read path: "recent appearances for my profile".
CREATE INDEX IF NOT EXISTS profile_search_appearances_profile_created
  ON public.profile_search_appearances (profile_id, created_at DESC);

-- =========================================================================
-- Row Level Security
-- =========================================================================
ALTER TABLE public.profile_search_appearances ENABLE ROW LEVEL SECURITY;

-- Authenticated viewers may INSERT their own appearance rows (cannot forge
-- on behalf of someone else).
CREATE POLICY profile_search_appearances_insert_self
  ON public.profile_search_appearances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = viewer_id);

-- Direct SELECT is restricted to platform admins. Profile owners read their
-- own aggregate via get_profile_search_appearances() only.
CREATE POLICY profile_search_appearances_admin_select
  ON public.profile_search_appearances
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- =========================================================================
-- RPC: daily aggregate for a profile owner
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_profile_search_appearances(
  p_profile_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  day DATE,
  appearances INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the profile owner (or an admin) may read analytics for a profile.
  IF auth.uid() <> p_profile_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorised to read appearances for this profile';
  END IF;

  -- Clamp window so a runaway p_days doesn't blow up the scan.
  p_days := LEAST(GREATEST(p_days, 1), 90);

  RETURN QUERY
  SELECT
    date_trunc('day', psa.created_at, 'UTC')::DATE AS day,
    COUNT(*)::INTEGER AS appearances
  FROM public.profile_search_appearances psa
  WHERE psa.profile_id = p_profile_id
    AND psa.created_at >= timezone('utc', now()) - (p_days || ' days')::INTERVAL
  GROUP BY date_trunc('day', psa.created_at, 'UTC')
  ORDER BY day ASC;
END;
$$;

COMMENT ON FUNCTION public.get_profile_search_appearances IS
  'Owner-facing aggregate of search appearances over the last N days (clamped 1..90). Returns daily buckets; viewer identity is deliberately never returned.';

GRANT EXECUTE ON FUNCTION public.get_profile_search_appearances(UUID, INTEGER) TO authenticated;
