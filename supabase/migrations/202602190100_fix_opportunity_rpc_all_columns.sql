-- =============================================================================
-- Fix: Return all opportunity columns from club RPC
-- =============================================================================
-- The previous version of fetch_club_opportunities_with_counts() only returned
-- 14 columns (enough for listing cards) but missed 11 columns needed by the
-- Edit and Duplicate flows:
--   description, start_date, duration_text, requirements[], benefits[],
--   custom_benefits[], application_deadline, contact_email, contact_phone,
--   organization_name, closed_at, club_id, version
--
-- This caused the Edit modal to show empty fields even though the data was
-- saved correctly in the DB, and Duplicate to create incomplete copies.
-- =============================================================================

DROP FUNCTION IF EXISTS public.fetch_club_opportunities_with_counts(uuid, boolean, integer);

CREATE OR REPLACE FUNCTION public.fetch_club_opportunities_with_counts(
  p_club_id UUID,
  p_include_closed BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  club_id UUID,
  title TEXT,
  opportunity_type public.opportunity_type,
  "position" public.opportunity_position,
  gender public.opportunity_gender,
  description TEXT,
  location_city TEXT,
  location_country TEXT,
  start_date DATE,
  duration_text TEXT,
  requirements TEXT[],
  benefits TEXT[],
  custom_benefits TEXT[],
  priority public.opportunity_priority,
  status public.opportunity_status,
  application_deadline DATE,
  contact_email TEXT,
  contact_phone TEXT,
  organization_name TEXT,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
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
    o.club_id,
    o.title,
    o.opportunity_type,
    o."position",
    o.gender,
    o.description,
    o.location_city,
    o.location_country,
    o.start_date,
    o.duration_text,
    o.requirements,
    o.benefits,
    o.custom_benefits,
    o.priority,
    o.status,
    o.application_deadline,
    o.contact_email,
    o.contact_phone,
    o.organization_name,
    o.published_at,
    o.closed_at,
    o.version,
    o.created_at,
    o.updated_at,
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
