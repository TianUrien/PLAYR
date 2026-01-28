-- ============================================================================
-- ADD admin_get_opportunities FUNCTION
-- ============================================================================
-- The frontend expects admin_get_opportunities but we have admin_get_vacancies.
-- Create the function with the expected name.
-- ============================================================================

SET search_path = public;

-- Create admin_get_opportunities (same as admin_get_vacancies)
CREATE OR REPLACE FUNCTION public.admin_get_opportunities(
  p_status opportunity_status DEFAULT NULL,
  p_club_id UUID DEFAULT NULL,
  p_days INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  club_id UUID,
  club_name TEXT,
  club_avatar_url TEXT,
  status opportunity_status,
  opportunity_type opportunity_type,
  "position" opportunity_position,
  location_city TEXT,
  location_country TEXT,
  application_count BIGINT,
  pending_count BIGINT,
  shortlisted_count BIGINT,
  first_application_at TIMESTAMPTZ,
  time_to_first_app_minutes INTEGER,
  created_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  application_deadline DATE,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get total count
  SELECT COUNT(*)
  INTO v_total
  FROM opportunities o
  WHERE
    (p_status IS NULL OR o.status = p_status)
    AND (p_club_id IS NULL OR o.club_id = p_club_id)
    AND (p_days IS NULL OR o.created_at > now() - (p_days || ' days')::INTERVAL);

  RETURN QUERY
  WITH opportunity_stats AS (
    SELECT
      oa.opportunity_id,
      COUNT(oa.id) as app_count,
      COUNT(oa.id) FILTER (WHERE oa.status = 'pending') as pending_cnt,
      COUNT(oa.id) FILTER (WHERE oa.status = 'shortlisted') as shortlisted_cnt,
      MIN(oa.applied_at) as first_app
    FROM opportunity_applications oa
    GROUP BY oa.opportunity_id
  )
  SELECT
    o.id,
    o.title,
    o.club_id,
    p.full_name as club_name,
    p.avatar_url as club_avatar_url,
    o.status,
    o.opportunity_type,
    o."position",
    o.location_city,
    o.location_country,
    COALESCE(os.app_count, 0)::BIGINT,
    COALESCE(os.pending_cnt, 0)::BIGINT,
    COALESCE(os.shortlisted_cnt, 0)::BIGINT,
    os.first_app,
    CASE
      WHEN os.first_app IS NOT NULL AND o.published_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (os.first_app - o.published_at))::INTEGER / 60
      ELSE NULL
    END,
    o.created_at,
    o.published_at,
    o.application_deadline,
    v_total
  FROM opportunities o
  JOIN profiles p ON p.id = o.club_id
  LEFT JOIN opportunity_stats os ON os.opportunity_id = o.id
  WHERE
    (p_status IS NULL OR o.status = p_status)
    AND (p_club_id IS NULL OR o.club_id = p_club_id)
    AND (p_days IS NULL OR o.created_at > now() - (p_days || ' days')::INTERVAL)
  ORDER BY o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_opportunities(opportunity_status, UUID, INTEGER, INTEGER, INTEGER) IS 'Get paginated opportunity list with application statistics for admin';

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.admin_get_opportunities(opportunity_status, UUID, INTEGER, INTEGER, INTEGER) TO authenticated;
