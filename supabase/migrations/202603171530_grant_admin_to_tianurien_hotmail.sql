-- ============================================================================
-- Grant admin access to tianurien@hotmail.com
-- ============================================================================
-- Ensures this Auth user always has app_metadata.is_admin = true in every
-- environment where migrations are applied.
-- ============================================================================

DO $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('is_admin', true)
  WHERE lower(email) = 'tianurien@hotmail.com'
    AND COALESCE((raw_app_meta_data ->> 'is_admin')::boolean, false) = false;
END;
$$;
