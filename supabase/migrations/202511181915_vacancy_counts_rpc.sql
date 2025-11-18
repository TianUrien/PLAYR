-- Batched vacancy fetch with applicant counts to reduce client round-trips
CREATE OR REPLACE FUNCTION public.fetch_club_vacancies_with_counts(
  p_club_id UUID,
  p_include_closed BOOLEAN DEFAULT TRUE,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  club_id UUID,
  opportunity_type opportunity_type,
  title TEXT,
  "position" vacancy_position,
  gender vacancy_gender,
  description TEXT,
  location_city TEXT,
  location_country TEXT,
  start_date DATE,
  duration_text TEXT,
  requirements TEXT[],
  benefits TEXT[],
  custom_benefits TEXT[],
  priority vacancy_priority,
  status vacancy_status,
  application_deadline DATE,
  contact_email TEXT,
  contact_phone TEXT,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  version INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  applicant_count INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  effective_limit INTEGER := LEAST(COALESCE(p_limit, 50), 200);
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.club_id,
    v.opportunity_type,
    v.title,
    v.position AS "position",
    v.gender,
    v.description,
    v.location_city,
    v.location_country,
    v.start_date,
    v.duration_text,
    v.requirements,
    v.benefits,
    v.custom_benefits,
    v.priority,
    v.status,
    v.application_deadline,
    v.contact_email,
    v.contact_phone,
    v.published_at,
    v.closed_at,
    v.version,
    v.created_at,
    v.updated_at,
    COALESCE(app_counts.applicant_count, 0)::INTEGER AS applicant_count
  FROM public.vacancies v
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS applicant_count
    FROM public.vacancy_applications va
    WHERE va.vacancy_id = v.id
  ) AS app_counts ON TRUE
  WHERE v.club_id = p_club_id
    AND (p_include_closed OR v.status = 'open')
  ORDER BY v.created_at DESC
  LIMIT effective_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fetch_club_vacancies_with_counts(UUID, BOOLEAN, INTEGER) TO authenticated, anon;
