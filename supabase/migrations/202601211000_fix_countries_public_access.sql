-- Fix countries table public access
-- The countries table policy was set to "authenticated" only, but the World page
-- needs to show country list to anonymous users before sign-in.
-- 
-- Root cause: Migration 202601201000 changed world_* views to SECURITY INVOKER,
-- which correctly respects RLS. But the countries table RLS policy only allowed
-- authenticated users, breaking anonymous access to the World page.

BEGIN;

-- Drop the existing policy that only allows authenticated users
DROP POLICY IF EXISTS "Countries are viewable by everyone" ON public.countries;

-- Create new policy that allows both authenticated AND anonymous users
CREATE POLICY "Countries are viewable by everyone"
  ON public.countries
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- Also grant SELECT to anon role (was only granted to authenticated)
GRANT SELECT ON public.countries TO anon;

COMMIT;
