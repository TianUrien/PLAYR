-- =============================================================================
-- Fix: Correct opportunity_type return type from TEXT to enum
-- =============================================================================
-- The previous migration (202601312200) declared opportunity_type as TEXT in
-- the RETURNS TABLE clause, but the actual column type is public.opportunity_type
-- (an enum). PostgreSQL error 42804: "Returned type opportunity_type does not
-- match expected type text in column 3."
-- =============================================================================

DROP FUNCTION IF EXISTS public.fetch_club_opportunities_with_counts(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.fetch_club_opportunities_with_counts(
  p_club_id UUID,
  p_include_closed BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  opportunity_type public.opportunity_type,
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.fetch_club_opportunities_with_counts(UUID, BOOLEAN, INTEGER)
  TO anon, authenticated, service_role;
