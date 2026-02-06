-- ============================================================================
-- ADMIN BRAND ANALYTICS
-- ============================================================================
-- Adds Brand metrics to the Admin Portal:
--   1. Updates admin_get_dashboard_stats with brand counts
--   2. Updates admin_get_signup_trends with brands column
--   3. Creates admin_get_brand_activity (paginated brand list with metrics)
--   4. Creates admin_get_brand_summary (summary statistics)
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. UPDATE admin_get_dashboard_stats — add brand metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
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
    -- User metrics
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),
    'blocked_users', (SELECT COUNT(*) FROM profiles WHERE is_blocked = true),
    'test_accounts', (SELECT COUNT(*) FROM profiles WHERE is_test_account = true),

    -- Brand metrics (NEW)
    'total_brands', (SELECT COUNT(*) FROM brands WHERE deleted_at IS NULL),
    'brands_7d', (SELECT COUNT(*) FROM brands WHERE created_at > now() - interval '7 days' AND deleted_at IS NULL),
    'total_brand_products', (SELECT COUNT(*) FROM brand_products WHERE deleted_at IS NULL),
    'total_brand_posts', (SELECT COUNT(*) FROM brand_posts WHERE deleted_at IS NULL),

    -- Signups
    'signups_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '7 days' AND NOT is_test_account),
    'signups_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '30 days' AND NOT is_test_account),

    -- Onboarding
    'onboarding_completed', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = true AND NOT is_test_account),
    'onboarding_pending', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = false AND NOT is_test_account),

    -- Content metrics
    'total_vacancies', (SELECT COUNT(*) FROM opportunities),
    'open_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'open'),
    'closed_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'closed'),
    'draft_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'draft'),
    'vacancies_7d', (SELECT COUNT(*) FROM opportunities WHERE created_at > now() - interval '7 days'),

    -- Applications
    'total_applications', (SELECT COUNT(*) FROM opportunity_applications),
    'pending_applications', (SELECT COUNT(*) FROM opportunity_applications WHERE status = 'pending'),
    'applications_7d', (SELECT COUNT(*) FROM opportunity_applications WHERE applied_at > now() - interval '7 days'),

    -- Engagement
    'total_conversations', (SELECT COUNT(*) FROM conversations),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE sent_at > now() - interval '7 days'),
    'total_friendships', (SELECT COUNT(*) FROM profile_friendships WHERE status = 'accepted'),

    -- Data health
    'auth_orphans', (
      SELECT COUNT(*)
      FROM auth.users au
      LEFT JOIN profiles p ON p.id = au.id
      WHERE p.id IS NULL
    ),
    'profile_orphans', (
      SELECT COUNT(*)
      FROM profiles p
      LEFT JOIN auth.users au ON au.id = p.id
      WHERE au.id IS NULL
    ),

    -- Timestamps
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

-- ============================================================================
-- 2. UPDATE admin_get_signup_trends — add brands column
-- ============================================================================
-- Must DROP first because we're changing the RETURNS TABLE (adding brands column)
DROP FUNCTION IF EXISTS public.admin_get_signup_trends(integer);

CREATE OR REPLACE FUNCTION public.admin_get_signup_trends(
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  total_signups BIGINT,
  players BIGINT,
  coaches BIGINT,
  clubs BIGINT,
  brands BIGINT
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
  SELECT
    d.date::DATE,
    COALESCE(COUNT(p.id), 0) AS total_signups,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'player'), 0) AS players,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'coach'), 0) AS coaches,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'club'), 0) AS clubs,
    COALESCE(COUNT(p.id) FILTER (WHERE p.role = 'brand'), 0) AS brands
  FROM generate_series(
    (now() - (p_days || ' days')::INTERVAL)::DATE,
    now()::DATE,
    '1 day'::INTERVAL
  ) AS d(date)
  LEFT JOIN profiles p ON p.created_at::DATE = d.date AND NOT p.is_test_account
  GROUP BY d.date
  ORDER BY d.date ASC;
END;
$$;

COMMENT ON FUNCTION public.admin_get_signup_trends IS 'Returns daily signup counts for the last N days, broken down by role (including brands)';

-- ============================================================================
-- 3. CREATE admin_get_brand_activity — paginated brand list with metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_brand_activity(
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  brand_id UUID,
  brand_name TEXT,
  logo_url TEXT,
  category TEXT,
  slug TEXT,
  is_verified BOOLEAN,
  product_count BIGINT,
  post_count BIGINT,
  last_activity_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ,
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
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_date_filter := CASE
    WHEN p_days IS NULL THEN '-infinity'::TIMESTAMPTZ
    ELSE now() - (p_days || ' days')::INTERVAL
  END;

  -- Get total count of brands in date range
  SELECT COUNT(*)
  INTO v_total
  FROM brands b
  WHERE b.deleted_at IS NULL
    AND b.created_at > v_date_filter;

  RETURN QUERY
  SELECT
    b.id AS brand_id,
    b.name AS brand_name,
    b.logo_url,
    b.category,
    b.slug,
    b.is_verified,
    COALESCE(bp_count.cnt, 0)::BIGINT AS product_count,
    COALESCE(bpost_count.cnt, 0)::BIGINT AS post_count,
    GREATEST(
      b.updated_at,
      bp_count.last_at,
      bpost_count.last_at
    ) AS last_activity_at,
    COALESCE(p.onboarding_completed, false) AS onboarding_completed,
    b.created_at,
    v_total
  FROM brands b
  LEFT JOIN profiles p ON p.id = b.profile_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(bp.created_at) AS last_at
    FROM brand_products bp
    WHERE bp.brand_id = b.id AND bp.deleted_at IS NULL
  ) bp_count ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(bpost.created_at) AS last_at
    FROM brand_posts bpost
    WHERE bpost.brand_id = b.id AND bpost.deleted_at IS NULL
  ) bpost_count ON true
  WHERE b.deleted_at IS NULL
    AND b.created_at > v_date_filter
  ORDER BY (COALESCE(bp_count.cnt, 0) + COALESCE(bpost_count.cnt, 0)) DESC, b.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_get_brand_activity IS 'Get brand activity with product/post counts, paginated';

-- ============================================================================
-- 4. CREATE admin_get_brand_summary — summary statistics
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_brand_summary()
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
    'total_brands', (
      SELECT COUNT(*) FROM brands WHERE deleted_at IS NULL
    ),
    'verified_brands', (
      SELECT COUNT(*) FROM brands WHERE is_verified = true AND deleted_at IS NULL
    ),
    'brands_with_products', (
      SELECT COUNT(DISTINCT bp.brand_id) FROM brand_products bp
      JOIN brands b ON b.id = bp.brand_id
      WHERE bp.deleted_at IS NULL AND b.deleted_at IS NULL
    ),
    'brands_with_posts', (
      SELECT COUNT(DISTINCT bpost.brand_id) FROM brand_posts bpost
      JOIN brands b ON b.id = bpost.brand_id
      WHERE bpost.deleted_at IS NULL AND b.deleted_at IS NULL
    ),
    'total_products', (
      SELECT COUNT(*) FROM brand_products WHERE deleted_at IS NULL
    ),
    'total_posts', (
      SELECT COUNT(*) FROM brand_posts WHERE deleted_at IS NULL
    ),
    'brands_7d', (
      SELECT COUNT(*) FROM brands
      WHERE created_at > now() - interval '7 days' AND deleted_at IS NULL
    ),
    'brands_30d', (
      SELECT COUNT(*) FROM brands
      WHERE created_at > now() - interval '30 days' AND deleted_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.admin_get_brand_summary IS 'Get summary statistics for brand analytics dashboard';

-- ============================================================================
-- 5. PERMISSIONS — hardened: service_role only
-- ============================================================================

-- Brand activity
REVOKE EXECUTE ON FUNCTION public.admin_get_brand_activity(integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_brand_activity(integer, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_brand_activity(integer, integer, integer) TO service_role;

-- Brand summary
REVOKE EXECUTE ON FUNCTION public.admin_get_brand_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_brand_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_brand_summary() TO service_role;

-- Dashboard stats (already hardened, but re-grant after CREATE OR REPLACE)
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO service_role;

-- Signup trends (already hardened, but re-grant after signature change)
REVOKE EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) TO service_role;
