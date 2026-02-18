-- =============================================================================
-- Simplify application_status enum to 4 values + align admin RPCs
-- =============================================================================
-- The application_status enum had 8 values (pending, reviewed, shortlisted,
-- maybe, interview, accepted, rejected, withdrawn) but only 4 are actually
-- used in the product:
--
--   pending     → "Unsorted"   (default)
--   shortlisted → "Good fit"
--   maybe       → "Maybe"
--   rejected    → "Not a fit"
--
-- The remaining 4 (reviewed, interview, accepted, withdrawn) were never
-- exposed in the UI and have no rows using them. This migration removes
-- the orphaned values and aligns the admin RPCs.
-- =============================================================================

-- Step 1: Convert any orphaned status values to 'pending' (safety net)
UPDATE public.opportunity_applications
SET status = 'pending'
WHERE status::text IN ('reviewed', 'interview', 'accepted', 'withdrawn');

-- Step 2: Drop the function that references application_status in its signature
DROP FUNCTION IF EXISTS public.admin_get_vacancy_applicants(UUID, public.application_status, INTEGER, INTEGER);

-- Step 2b: Drop RLS policy that references the status column with 'withdrawn' value
-- (withdrawn is being removed; this policy is no longer valid)
DROP POLICY IF EXISTS "Applicants can withdraw applications" ON public.opportunity_applications;

-- Step 3: Alter column to TEXT so we can drop the enum
ALTER TABLE public.opportunity_applications
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status TYPE TEXT USING status::TEXT;

-- Step 4: Drop the old enum
DROP TYPE public.application_status;

-- Step 5: Create the simplified enum with only 4 values
CREATE TYPE public.application_status AS ENUM (
  'pending',
  'shortlisted',
  'maybe',
  'rejected'
);

-- Step 6: Drop the text default, alter column back to enum, then re-set default
ALTER TABLE public.opportunity_applications ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.opportunity_applications
  ALTER COLUMN status TYPE public.application_status USING status::public.application_status;
ALTER TABLE public.opportunity_applications
  ALTER COLUMN status SET DEFAULT 'pending'::public.application_status;

-- =============================================================================
-- Step 7: Recreate admin_get_vacancy_applicants with new enum
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_vacancy_applicants(
  p_vacancy_id UUID,
  p_status application_status DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  application_id UUID,
  player_id UUID,
  player_name TEXT,
  player_email TEXT,
  nationality TEXT,
  "position" TEXT,
  avatar_url TEXT,
  highlight_video_url TEXT,
  status application_status,
  applied_at TIMESTAMPTZ,
  cover_letter TEXT,
  onboarding_completed BOOLEAN,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT COUNT(*)
  INTO v_total
  FROM opportunity_applications oa
  WHERE oa.opportunity_id = p_vacancy_id
    AND (p_status IS NULL OR oa.status = p_status);

  RETURN QUERY
  SELECT
    oa.id as application_id,
    oa.applicant_id as player_id,
    p.full_name as player_name,
    p.email as player_email,
    COALESCE(c.name, p.nationality) as nationality,
    p."position",
    p.avatar_url,
    p.highlight_video_url,
    oa.status,
    oa.applied_at,
    oa.cover_letter,
    p.onboarding_completed,
    v_total
  FROM opportunity_applications oa
  JOIN profiles p ON p.id = oa.applicant_id
  LEFT JOIN countries c ON c.id = p.nationality_country_id
  WHERE oa.opportunity_id = p_vacancy_id
    AND (p_status IS NULL OR oa.status = p_status)
  ORDER BY oa.applied_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_vacancy_applicants IS 'Get applicants for a specific opportunity with profile details';
GRANT EXECUTE ON FUNCTION public.admin_get_vacancy_applicants TO authenticated;

-- =============================================================================
-- Step 8: Update admin_get_vacancy_detail — only count 4 statuses
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_vacancy_detail(
  p_vacancy_id UUID
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
    'vacancy', (
      SELECT row_to_json(o.*)
      FROM opportunities o
      WHERE o.id = p_vacancy_id
    ),
    'club', (
      SELECT json_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'avatar_url', p.avatar_url,
        'base_location', p.base_location
      )
      FROM opportunities o
      JOIN profiles p ON p.id = o.club_id
      WHERE o.id = p_vacancy_id
    ),
    'stats', (
      SELECT json_build_object(
        'total_applications', COUNT(oa.id),
        'pending', COUNT(oa.id) FILTER (WHERE oa.status = 'pending'),
        'shortlisted', COUNT(oa.id) FILTER (WHERE oa.status = 'shortlisted'),
        'maybe', COUNT(oa.id) FILTER (WHERE oa.status = 'maybe'),
        'rejected', COUNT(oa.id) FILTER (WHERE oa.status = 'rejected'),
        'first_application_at', MIN(oa.applied_at),
        'last_application_at', MAX(oa.applied_at),
        'avg_apps_per_day', CASE
          WHEN (SELECT published_at FROM opportunities WHERE id = p_vacancy_id) IS NOT NULL
          THEN ROUND(
            COUNT(oa.id)::NUMERIC /
            NULLIF(EXTRACT(EPOCH FROM (now() - (SELECT published_at FROM opportunities WHERE id = p_vacancy_id))) / 86400, 0),
            1
          )
          ELSE NULL
        END
      )
      FROM opportunity_applications oa
      WHERE oa.opportunity_id = p_vacancy_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_vacancy_detail IS 'Get full opportunity details with club info and application stats';

-- =============================================================================
-- Step 9: Update admin_get_extended_dashboard_stats — only count 4 statuses
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_extended_dashboard_stats()
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
    'vacancies_7d', (SELECT COUNT(*) FROM opportunities WHERE created_at > now() - interval '7 days'),
    'vacancies_30d', (SELECT COUNT(*) FROM opportunities WHERE created_at > now() - interval '30 days'),
    'avg_apps_per_vacancy', (
      SELECT ROUND(AVG(app_count)::NUMERIC, 1)
      FROM (
        SELECT COUNT(oa.id) as app_count
        FROM opportunities o
        LEFT JOIN opportunity_applications oa ON oa.opportunity_id = o.id
        WHERE o.status IN ('open', 'closed')
        GROUP BY o.id
      ) sub
    ),
    'active_clubs_7d', (
      SELECT COUNT(DISTINCT club_id) FROM opportunities
      WHERE created_at > now() - interval '7 days'
    ),
    'active_clubs_30d', (
      SELECT COUNT(DISTINCT club_id) FROM opportunities
      WHERE created_at > now() - interval '30 days'
    ),
    'vacancy_fill_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'closed')::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM opportunities
      WHERE created_at > now() - interval '90 days'
    ),

    'players_with_video', (
      SELECT COUNT(*) FROM profiles
      WHERE role = 'player' AND NOT is_test_account
        AND highlight_video_url IS NOT NULL
    ),
    'players_with_video_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE highlight_video_url IS NOT NULL)::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM profiles
      WHERE role = 'player' AND NOT is_test_account
    ),
    'players_applied_ever', (
      SELECT COUNT(DISTINCT applicant_id) FROM opportunity_applications
    ),
    'players_applied_7d', (
      SELECT COUNT(DISTINCT applicant_id) FROM opportunity_applications
      WHERE applied_at > now() - interval '7 days'
    ),
    'avg_profile_score', (
      SELECT ROUND(AVG(score)::NUMERIC, 0)
      FROM (
        SELECT
          (
            CASE WHEN nationality IS NOT NULL AND base_location IS NOT NULL AND "position" IS NOT NULL THEN 25 ELSE 0 END +
            CASE WHEN avatar_url IS NOT NULL THEN 20 ELSE 0 END +
            CASE WHEN highlight_video_url IS NOT NULL THEN 25 ELSE 0 END
          ) as score
        FROM profiles
        WHERE role = 'player' AND NOT is_test_account
      ) sub
    ),
    'onboarding_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE onboarding_completed)::NUMERIC /
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM profiles
      WHERE NOT is_test_account
    ),

    'application_status_breakdown', (
      SELECT json_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'shortlisted', COUNT(*) FILTER (WHERE status = 'shortlisted'),
        'maybe', COUNT(*) FILTER (WHERE status = 'maybe'),
        'rejected', COUNT(*) FILTER (WHERE status = 'rejected')
      )
      FROM opportunity_applications
    ),

    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION public.admin_get_extended_dashboard_stats IS 'Extended dashboard statistics with opportunity and player insights';
