-- ============================================================================
-- HEALTH CHECK RPC
-- ============================================================================
-- Lightweight function for the /health Edge Function to verify DB connectivity.
-- Returns true if the database is reachable and responsive.
-- ============================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

-- Allow the service role (Edge Functions) and authenticated users to call it
GRANT EXECUTE ON FUNCTION public.health_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.health_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.health_check() TO anon;
