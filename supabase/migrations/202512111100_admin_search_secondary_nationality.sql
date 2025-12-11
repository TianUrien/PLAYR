-- Add secondary nationality (nationality2) to admin_search_profiles
-- This allows admins to see both primary and secondary nationality in the directory

BEGIN;

-- ============================================================================
-- DROP existing function first (return type is changing)
-- ============================================================================
DROP FUNCTION IF EXISTS public.admin_search_profiles(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER);

-- ============================================================================
-- CREATE admin_search_profiles with nationality2
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_search_profiles(
  p_query TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_is_blocked BOOLEAN DEFAULT NULL,
  p_is_test_account BOOLEAN DEFAULT NULL,
  p_onboarding_completed BOOLEAN DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  username TEXT,
  role TEXT,
  nationality TEXT,
  nationality2 TEXT,
  base_location TEXT,
  is_blocked BOOLEAN,
  is_test_account BOOLEAN,
  onboarding_completed BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  avatar_url TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count BIGINT;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get total count for pagination
  SELECT COUNT(*)
  INTO v_total_count
  FROM profiles p
  WHERE 
    (p_query IS NULL OR (
      p.email ILIKE '%' || p_query || '%' OR
      p.full_name ILIKE '%' || p_query || '%' OR
      p.username ILIKE '%' || p_query || '%' OR
      p.id::TEXT = p_query
    ))
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test_account IS NULL OR p.is_test_account = p_is_test_account)
    AND (p_onboarding_completed IS NULL OR p.onboarding_completed = p_onboarding_completed);

  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.username,
    p.role,
    COALESCE(c.name, p.nationality) AS nationality,
    c2.name AS nationality2,
    p.base_location,
    p.is_blocked,
    p.is_test_account,
    p.onboarding_completed,
    p.created_at,
    p.updated_at,
    p.avatar_url,
    v_total_count AS total_count
  FROM profiles p
  LEFT JOIN countries c ON c.id = p.nationality_country_id
  LEFT JOIN countries c2 ON c2.id = p.nationality2_country_id
  WHERE 
    (p_query IS NULL OR (
      p.email ILIKE '%' || p_query || '%' OR
      p.full_name ILIKE '%' || p_query || '%' OR
      p.username ILIKE '%' || p_query || '%' OR
      p.id::TEXT = p_query
    ))
    AND (p_role IS NULL OR p.role = p_role)
    AND (p_is_blocked IS NULL OR p.is_blocked = p_is_blocked)
    AND (p_is_test_account IS NULL OR p.is_test_account = p_is_test_account)
    AND (p_onboarding_completed IS NULL OR p.onboarding_completed = p_onboarding_completed)
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_search_profiles IS 'Search and filter profiles for the admin directory (includes secondary nationality)';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;

COMMIT;
