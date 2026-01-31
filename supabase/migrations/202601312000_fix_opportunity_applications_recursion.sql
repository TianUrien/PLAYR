-- ============================================================================
-- Migration: Fix infinite recursion in opportunity_applications RLS
-- ============================================================================
-- Problem 1: "Clubs can view applicant player profiles" policy on profiles
-- creates a circular dependency when inserting into opportunity_applications:
--   INSERT opportunity_applications → WITH CHECK → SELECT profiles
--   → profiles RLS "Clubs can view applicant player profiles" → SELECT opportunity_applications
--   → opportunity_applications RLS → ... INFINITE RECURSION (42P17)
--
-- Fix: Replace the direct subquery with a SECURITY DEFINER helper function
-- that bypasses RLS on the inner query, breaking the recursion chain.
--
-- Problem 2: get_opportunity_alerts() still references the old "vacancies"
-- table name after the terminology alignment rename. This causes a 404 error.
--
-- Fix: Update the function to reference "opportunities" instead.
-- ============================================================================

-- ============================================================================
-- FIX 1: Break RLS recursion on profiles ↔ opportunity_applications
-- ============================================================================

-- Helper function that bypasses RLS (SECURITY DEFINER) to check if a club
-- has received an application from a given player.
CREATE OR REPLACE FUNCTION public.club_has_applicant(p_club_id UUID, p_player_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.opportunity_applications oa
    JOIN public.opportunities o ON o.id = oa.opportunity_id
    WHERE oa.applicant_id = p_player_id
      AND o.club_id = p_club_id
  );
$$;

COMMENT ON FUNCTION public.club_has_applicant IS
  'SECURITY DEFINER helper to check if a player has applied to any of a club''s opportunities. Used in profiles RLS to avoid infinite recursion.';

-- Drop the old policy that caused recursion (it referenced opportunity_applications
-- directly via a subquery, which triggered RLS back on the same table).
DROP POLICY IF EXISTS "Clubs can view applicant player profiles" ON public.profiles;

-- Recreate with the SECURITY DEFINER helper — no recursion.
CREATE POLICY "Clubs can view applicant player profiles"
  ON public.profiles
  FOR SELECT
  USING (
    role = 'player'
    AND public.club_has_applicant(auth.uid(), id)
  );

-- ============================================================================
-- FIX 2: Update get_opportunity_alerts to use renamed table
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_opportunity_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  current_user_id UUID := auth.uid();
  baseline TIMESTAMPTZ := '1970-01-01 00:00:00+00'::timestamptz;
  last_seen TIMESTAMPTZ := baseline;
BEGIN
  IF current_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(last_seen_at, baseline)
    INTO last_seen
    FROM public.opportunity_inbox_state
   WHERE user_id = current_user_id;

  RETURN (
    SELECT COUNT(*)
      FROM public.opportunities v
     WHERE v.status = 'open'
       AND COALESCE(v.published_at, v.created_at) > last_seen
  );
END;
$$;
