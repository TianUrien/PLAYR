-- ============================================================================
-- Migration: RLS policies for brands table
-- ============================================================================

SET search_path = public;

BEGIN;

-- Enable RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT: Anyone can view non-deleted brands
-- ============================================================================
DROP POLICY IF EXISTS "Brands are publicly readable" ON public.brands;
CREATE POLICY "Brands are publicly readable"
  ON public.brands
  FOR SELECT
  USING (deleted_at IS NULL);

-- ============================================================================
-- INSERT: Only brand role users can create their brand (enforced by RPC)
-- ============================================================================
DROP POLICY IF EXISTS "Brand users can create their brand" ON public.brands;
CREATE POLICY "Brand users can create their brand"
  ON public.brands
  FOR INSERT
  WITH CHECK (
    auth.uid() = profile_id
    AND public.current_profile_role() = 'brand'
  );

-- ============================================================================
-- UPDATE: Only the brand owner can update their brand
-- ============================================================================
DROP POLICY IF EXISTS "Brand users can update their brand" ON public.brands;
CREATE POLICY "Brand users can update their brand"
  ON public.brands
  FOR UPDATE
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);

-- ============================================================================
-- DELETE: Prevent hard deletes (use soft delete via UPDATE)
-- ============================================================================
DROP POLICY IF EXISTS "No hard deletes on brands" ON public.brands;
CREATE POLICY "No hard deletes on brands"
  ON public.brands
  FOR DELETE
  USING (false);

-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT INSERT, UPDATE ON public.brands TO authenticated;

COMMIT;
