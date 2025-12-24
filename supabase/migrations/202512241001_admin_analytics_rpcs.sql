-- ============================================================================
-- ADMIN ANALYTICS RPC FUNCTIONS
-- ============================================================================
-- New RPC functions for enhanced admin analytics:
-- 1. Vacancy management and analytics
-- 2. Club activity tracking
-- 3. Player funnel and profile completeness
-- 4. Extended dashboard stats
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. VACANCY LIST WITH ANALYTICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_vacancies(
  p_status vacancy_status DEFAULT NULL,
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
  status vacancy_status,
  opportunity_type opportunity_type,
  "position" vacancy_position,
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
  FROM vacancies v
  WHERE 
    (p_status IS NULL OR v.status = p_status)
    AND (p_club_id IS NULL OR v.club_id = p_club_id)
    AND (p_days IS NULL OR v.created_at > now() - (p_days || ' days')::INTERVAL);
  
  RETURN QUERY
  WITH vacancy_stats AS (
    SELECT 
      va.vacancy_id,
      COUNT(va.id) as app_count,
      COUNT(va.id) FILTER (WHERE va.status = 'pending') as pending_cnt,
      COUNT(va.id) FILTER (WHERE va.status = 'shortlisted') as shortlisted_cnt,
      MIN(va.applied_at) as first_app
    FROM vacancy_applications va
    GROUP BY va.vacancy_id
  )
  SELECT 
    v.id,
    v.title,
    v.club_id,
    p.full_name as club_name,
    p.avatar_url as club_avatar_url,
    v.status,
    v.opportunity_type,
    v."position",
    v.location_city,
    v.location_country,
    COALESCE(vs.app_count, 0)::BIGINT,
    COALESCE(vs.pending_cnt, 0)::BIGINT,
    COALESCE(vs.shortlisted_cnt, 0)::BIGINT,
    vs.first_app,
    CASE 
      WHEN vs.first_app IS NOT NULL AND v.published_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (vs.first_app - v.published_at))::INTEGER / 60
      ELSE NULL
    END,
    v.created_at,
    v.published_at,
    v.application_deadline,
    v_total
  FROM vacancies v
  JOIN profiles p ON p.id = v.club_id
  LEFT JOIN vacancy_stats vs ON vs.vacancy_id = v.id
  WHERE 
    (p_status IS NULL OR v.status = p_status)
    AND (p_club_id IS NULL OR v.club_id = p_club_id)
    AND (p_days IS NULL OR v.created_at > now() - (p_days || ' days')::INTERVAL)
  ORDER BY v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_vacancies IS 'Get paginated vacancy list with application statistics for admin';

-- ============================================================================
-- 2. VACANCY APPLICANTS LIST
-- ============================================================================
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
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  -- Get total count
  SELECT COUNT(*)
  INTO v_total
  FROM vacancy_applications va
  WHERE va.vacancy_id = p_vacancy_id
    AND (p_status IS NULL OR va.status = p_status);
  
  RETURN QUERY
  SELECT 
    va.id as application_id,
    va.player_id,
    p.full_name as player_name,
    p.email as player_email,
    COALESCE(c.name, p.nationality) as nationality,
    p."position",
    p.avatar_url,
    p.highlight_video_url,
    va.status,
    va.applied_at,
    va.cover_letter,
    p.onboarding_completed,
    v_total
  FROM vacancy_applications va
  JOIN profiles p ON p.id = va.player_id
  LEFT JOIN countries c ON c.id = p.nationality_country_id
  WHERE va.vacancy_id = p_vacancy_id
    AND (p_status IS NULL OR va.status = p_status)
  ORDER BY va.applied_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_vacancy_applicants IS 'Get applicants for a specific vacancy with profile details';

-- ============================================================================
-- 3. VACANCY DETAIL
-- ============================================================================
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
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  SELECT json_build_object(
    'vacancy', (
      SELECT row_to_json(v.*)
      FROM vacancies v
      WHERE v.id = p_vacancy_id
    ),
    'club', (
      SELECT json_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'email', p.email,
        'avatar_url', p.avatar_url,
        'base_location', p.base_location
      )
      FROM vacancies v
      JOIN profiles p ON p.id = v.club_id
      WHERE v.id = p_vacancy_id
    ),
    'stats', (
      SELECT json_build_object(
        'total_applications', COUNT(va.id),
        'pending', COUNT(va.id) FILTER (WHERE va.status = 'pending'),
        'reviewed', COUNT(va.id) FILTER (WHERE va.status = 'reviewed'),
        'shortlisted', COUNT(va.id) FILTER (WHERE va.status = 'shortlisted'),
        'interview', COUNT(va.id) FILTER (WHERE va.status = 'interview'),
        'accepted', COUNT(va.id) FILTER (WHERE va.status = 'accepted'),
        'rejected', COUNT(va.id) FILTER (WHERE va.status = 'rejected'),
        'withdrawn', COUNT(va.id) FILTER (WHERE va.status = 'withdrawn'),
        'first_application_at', MIN(va.applied_at),
        'last_application_at', MAX(va.applied_at),
        'avg_apps_per_day', CASE 
          WHEN (SELECT published_at FROM vacancies WHERE id = p_vacancy_id) IS NOT NULL 
          THEN ROUND(
            COUNT(va.id)::NUMERIC / 
            NULLIF(EXTRACT(EPOCH FROM (now() - (SELECT published_at FROM vacancies WHERE id = p_vacancy_id))) / 86400, 0),
            1
          )
          ELSE NULL
        END
      )
      FROM vacancy_applications va
      WHERE va.vacancy_id = p_vacancy_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_vacancy_detail IS 'Get full vacancy details with club info and application stats';

-- ============================================================================
-- 4. CLUB ACTIVITY ANALYTICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_club_activity(
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  club_id UUID,
  club_name TEXT,
  avatar_url TEXT,
  base_location TEXT,
  vacancy_count BIGINT,
  open_vacancy_count BIGINT,
  total_applications BIGINT,
  avg_apps_per_vacancy NUMERIC,
  last_posted_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_date_filter TIMESTAMPTZ;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  v_date_filter := CASE 
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ 
    ELSE now() - (p_days || ' days')::INTERVAL 
  END;
  
  -- Get total count of clubs with vacancies
  SELECT COUNT(DISTINCT p.id)
  INTO v_total
  FROM profiles p
  JOIN vacancies v ON v.club_id = p.id AND v.created_at > v_date_filter
  WHERE p.role = 'club' AND NOT p.is_test_account;
  
  RETURN QUERY
  SELECT 
    p.id as club_id,
    p.full_name as club_name,
    p.avatar_url,
    p.base_location,
    COUNT(DISTINCT v.id)::BIGINT as vacancy_count,
    COUNT(DISTINCT v.id) FILTER (WHERE v.status = 'open')::BIGINT as open_vacancy_count,
    COUNT(va.id)::BIGINT as total_applications,
    ROUND(COUNT(va.id)::NUMERIC / NULLIF(COUNT(DISTINCT v.id), 0), 1) as avg_apps_per_vacancy,
    MAX(v.created_at) as last_posted_at,
    p.onboarding_completed,
    v_total
  FROM profiles p
  JOIN vacancies v ON v.club_id = p.id AND v.created_at > v_date_filter
  LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id
  WHERE p.role = 'club' AND NOT p.is_test_account
  GROUP BY p.id
  ORDER BY COUNT(DISTINCT v.id) DESC, COUNT(va.id) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_club_activity IS 'Get club posting activity with vacancy and application stats';

-- ============================================================================
-- 5. CLUB SUMMARY STATS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_club_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  SELECT json_build_object(
    'total_clubs', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'club' AND NOT is_test_account
    ),
    'clubs_with_vacancies', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies
    ),
    'active_clubs_7d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '7 days'
    ),
    'active_clubs_30d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '30 days'
    ),
    'active_clubs_90d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '90 days'
    ),
    'clubs_onboarded', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'club' AND NOT is_test_account AND onboarding_completed = true
    ),
    'avg_vacancies_per_active_club', (
      SELECT ROUND(AVG(vac_count)::NUMERIC, 1)
      FROM (
        SELECT COUNT(*) as vac_count
        FROM vacancies
        GROUP BY club_id
      ) sub
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_club_summary IS 'Get summary statistics for club analytics dashboard';

-- ============================================================================
-- 6. PLAYER FUNNEL METRICS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_player_funnel(
  p_days INTEGER DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_date_filter TIMESTAMPTZ;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;
  
  v_date_filter := CASE 
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ 
    ELSE now() - (p_days || ' days')::INTERVAL 
  END;
  
  SELECT json_build_object(
    'signed_up', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND created_at > v_date_filter
    ),
    'onboarding_completed', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND onboarding_completed = true
        AND created_at > v_date_filter
    ),
    'has_avatar', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND avatar_url IS NOT NULL
        AND created_at > v_date_filter
    ),
    'has_video', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND highlight_video_url IS NOT NULL
        AND created_at > v_date_filter
    ),
    'has_journey_entry', (
      SELECT COUNT(DISTINCT ph.user_id) FROM playing_history ph
      JOIN profiles p ON p.id = ph.user_id
      WHERE p.role = 'player' AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'has_gallery_photo', (
      SELECT COUNT(DISTINCT gp.user_id) FROM gallery_photos gp
      JOIN profiles p ON p.id = gp.user_id
      WHERE p.role = 'player' AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'applied_to_vacancy', (
      SELECT COUNT(DISTINCT va.player_id) FROM vacancy_applications va
      JOIN profiles p ON p.id = va.player_id
      WHERE p.role = 'player' AND NOT p.is_test_account
        AND p.created_at > v_date_filter
    ),
    'open_to_opportunities', (
      SELECT COUNT(*) FROM profiles 
      WHERE role = 'player' AND NOT is_test_account 
        AND open_to_opportunities = true
        AND created_at > v_date_filter
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_player_funnel IS 'Get player journey funnel metrics for analytics';

-- ============================================================================
-- 7. PROFILE COMPLETENESS DISTRIBUTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_profile_completeness_distribution(
  p_role TEXT DEFAULT 'player'
)
RETURNS TABLE (
  bucket TEXT,
  count BIGINT,
  percentage NUMERIC
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
  
  SELECT COUNT(*) INTO v_total 
  FROM profiles 
  WHERE role = p_role AND NOT is_test_account;
  
  RETURN QUERY
  WITH scores AS (
    SELECT 
      p.id,
      CASE p_role
        WHEN 'player' THEN (
          CASE WHEN p.nationality IS NOT NULL AND p.base_location IS NOT NULL AND p."position" IS NOT NULL THEN 25 ELSE 0 END +
          CASE WHEN p.avatar_url IS NOT NULL THEN 20 ELSE 0 END +
          CASE WHEN p.highlight_video_url IS NOT NULL THEN 25 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM playing_history WHERE user_id = p.id) THEN 15 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM gallery_photos WHERE user_id = p.id) THEN 15 ELSE 0 END
        )
        WHEN 'club' THEN (
          CASE WHEN p.nationality IS NOT NULL AND p.base_location IS NOT NULL AND p.year_founded IS NOT NULL THEN 35 ELSE 0 END +
          CASE WHEN p.avatar_url IS NOT NULL THEN 25 ELSE 0 END +
          CASE WHEN p.club_bio IS NOT NULL AND LENGTH(p.club_bio) > 20 THEN 20 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM club_media WHERE club_id = p.id) THEN 20 ELSE 0 END
        )
        ELSE (
          CASE WHEN p.nationality IS NOT NULL AND p.base_location IS NOT NULL THEN 30 ELSE 0 END +
          CASE WHEN p.avatar_url IS NOT NULL THEN 25 ELSE 0 END +
          CASE WHEN p.bio IS NOT NULL AND LENGTH(p.bio) > 20 THEN 25 ELSE 0 END +
          CASE WHEN EXISTS (SELECT 1 FROM playing_history WHERE user_id = p.id) THEN 20 ELSE 0 END
        )
      END as score
    FROM profiles p
    WHERE p.role = p_role AND NOT p.is_test_account
  )
  SELECT 
    bucketed.bucket,
    bucketed.cnt,
    ROUND(bucketed.cnt::NUMERIC / NULLIF(v_total, 0) * 100, 1)
  FROM (
    SELECT 
      CASE 
        WHEN score <= 25 THEN '0-25%'
        WHEN score <= 50 THEN '26-50%'
        WHEN score <= 75 THEN '51-75%'
        ELSE '76-100%'
      END as bucket,
      COUNT(*) as cnt
    FROM scores
    GROUP BY 1
  ) bucketed
  ORDER BY 
    CASE bucketed.bucket
      WHEN '0-25%' THEN 1
      WHEN '26-50%' THEN 2
      WHEN '51-75%' THEN 3
      WHEN '76-100%' THEN 4
    END;
END;
$$;

COMMENT ON FUNCTION public.admin_get_profile_completeness_distribution IS 'Get profile completeness score distribution by role';

-- ============================================================================
-- 8. EXTENDED DASHBOARD STATS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_extended_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    -- Vacancy performance metrics
    'vacancies_7d', (SELECT COUNT(*) FROM vacancies WHERE created_at > now() - interval '7 days'),
    'vacancies_30d', (SELECT COUNT(*) FROM vacancies WHERE created_at > now() - interval '30 days'),
    'avg_apps_per_vacancy', (
      SELECT ROUND(AVG(app_count)::NUMERIC, 1)
      FROM (
        SELECT COUNT(va.id) as app_count
        FROM vacancies v
        LEFT JOIN vacancy_applications va ON va.vacancy_id = v.id
        WHERE v.status IN ('open', 'closed')
        GROUP BY v.id
      ) sub
    ),
    'active_clubs_7d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '7 days'
    ),
    'active_clubs_30d', (
      SELECT COUNT(DISTINCT club_id) FROM vacancies 
      WHERE created_at > now() - interval '30 days'
    ),
    'vacancy_fill_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE status = 'closed')::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 0
      )
      FROM vacancies
      WHERE created_at > now() - interval '90 days'
    ),
    
    -- Player insight metrics
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
      SELECT COUNT(DISTINCT player_id) FROM vacancy_applications
    ),
    'players_applied_7d', (
      SELECT COUNT(DISTINCT player_id) FROM vacancy_applications
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
    
    -- Application status breakdown
    'application_status_breakdown', (
      SELECT json_build_object(
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'reviewed', COUNT(*) FILTER (WHERE status = 'reviewed'),
        'shortlisted', COUNT(*) FILTER (WHERE status = 'shortlisted'),
        'interview', COUNT(*) FILTER (WHERE status = 'interview'),
        'accepted', COUNT(*) FILTER (WHERE status = 'accepted'),
        'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
        'withdrawn', COUNT(*) FILTER (WHERE status = 'withdrawn')
      )
      FROM vacancy_applications
    ),
    
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION public.admin_get_extended_dashboard_stats IS 'Extended dashboard statistics with vacancy and player insights';

-- ============================================================================
-- 9. GRANT PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.admin_get_vacancies TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_vacancy_applicants TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_vacancy_detail TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_club_activity TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_club_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_player_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_completeness_distribution TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_extended_dashboard_stats TO authenticated;
