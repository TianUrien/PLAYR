-- Fix admin_get_auth_orphans function - ensure column types match
CREATE OR REPLACE FUNCTION public.admin_get_auth_orphans()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  intended_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    au.id AS user_id,
    au.email::TEXT,
    au.created_at,
    au.last_sign_in_at,
    au.email_confirmed_at,
    (au.raw_user_meta_data ->> 'role')::TEXT AS intended_role
  FROM auth.users au
  LEFT JOIN profiles p ON p.id = au.id
  WHERE p.id IS NULL
  ORDER BY au.created_at DESC;
END;
$$;
