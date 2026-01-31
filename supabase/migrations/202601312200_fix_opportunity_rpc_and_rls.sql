-- =============================================================================
-- Fix: Restore 3-param RPC function + RLS role check for opportunities
-- =============================================================================
-- The terminology alignment migration (202601272000) introduced two regressions:
--
-- 1. fetch_club_opportunities_with_counts was recreated with only 1 param
--    (p_club_id), but the client sends 3 (p_club_id, p_include_closed, p_limit).
--    This causes the RPC call to fail with a signature mismatch.
--
-- 2. The returned column was named 'application_count' but the client expects
--    'applicant_count' (matching the original function).
--
-- 3. The RLS policy "Clubs can manage their opportunities" was recreated
--    without the current_profile_role() = 'club' check from the original
--    migration (202511221520_profile_role_source_of_truth.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix the RPC function: restore 3-param signature + correct return columns
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fetch_club_opportunities_with_counts(uuid);

CREATE OR REPLACE FUNCTION public.fetch_club_opportunities_with_counts(
  p_club_id UUID,
  p_include_closed BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  opportunity_type TEXT,
  "position" public.opportunity_position,
  gender public.opportunity_gender,
  location_city TEXT,
  location_country TEXT,
  status public.opportunity_status,
  priority public.opportunity_priority,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  applicant_count BIGINT,
  pending_count BIGINT
)
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  effective_limit INTEGER := LEAST(COALESCE(p_limit, 50), 200);
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.title,
    o.opportunity_type,
    o."position",
    o.gender,
    o.location_city,
    o.location_country,
    o.status,
    o.priority,
    o.created_at,
    o.updated_at,
    o.published_at,
    COALESCE(counts.total, 0) AS applicant_count,
    COALESCE(counts.pending, 0) AS pending_count
  FROM public.opportunities o
  LEFT JOIN (
    SELECT
      oa.opportunity_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE oa.status = 'pending') AS pending
    FROM public.opportunity_applications oa
    GROUP BY oa.opportunity_id
  ) counts ON counts.opportunity_id = o.id
  WHERE o.club_id = p_club_id
    AND (p_include_closed OR o.status <> 'closed')
  ORDER BY o.created_at DESC
  LIMIT effective_limit;
END;
$$;

-- Grant permissions (matching existing grants)
GRANT EXECUTE ON FUNCTION public.fetch_club_opportunities_with_counts(UUID, BOOLEAN, INTEGER)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Fix the RLS policy: add current_profile_role() = 'club' check
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Clubs can manage their opportunities" ON public.opportunities;

CREATE POLICY "Clubs can manage their opportunities"
  ON public.opportunities
  FOR ALL
  USING (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  )
  WITH CHECK (
    auth.uid() = club_id
    AND COALESCE(public.current_profile_role(), '') = 'club'
  );
