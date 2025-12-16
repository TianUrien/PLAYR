-- Migration: Fix public_opportunities view security
-- Changes the view from SECURITY DEFINER to SECURITY INVOKER
-- 
-- SECURITY INVOKER (safe): View runs with the permissions of the querying user
-- SECURITY DEFINER (risky): View runs with the permissions of the view creator, bypassing RLS
--
-- Since this view queries tables with RLS enabled, we want SECURITY INVOKER
-- to ensure RLS policies are properly enforced.

-- ============================================================================
-- RECREATE VIEW WITH SECURITY INVOKER
-- ============================================================================

-- Drop and recreate the view with explicit SECURITY INVOKER
DROP VIEW IF EXISTS public.public_opportunities;

CREATE VIEW public.public_opportunities
WITH (security_invoker = true)
AS
SELECT 
  -- Opportunity identifiers (public)
  v.id,
  v.title,
  v.opportunity_type,
  
  -- Position details (public)
  v.position,
  v.gender,
  v.description,
  
  -- Location (public)
  v.location_city,
  v.location_country,
  
  -- Timing (public)
  v.start_date,
  v.duration_text,
  v.application_deadline,
  v.priority,
  
  -- Requirements & Benefits (public)
  v.requirements,
  v.benefits,
  v.custom_benefits,
  
  -- Timestamps (public)
  v.published_at,
  v.created_at,
  
  -- Club info (sanitized - no internal IDs or contact info)
  p.full_name AS club_name,
  p.avatar_url AS club_logo_url,
  p.base_location AS club_location,
  p.league_division AS club_league

FROM public.vacancies v
INNER JOIN public.profiles p ON p.id = v.club_id
WHERE 
  -- Only open vacancies
  v.status = 'open'
  -- Exclude test accounts
  AND COALESCE(p.is_test_account, false) = false
  -- Only clubs with completed profiles
  AND p.onboarding_completed = true;

-- Add documentation
COMMENT ON VIEW public.public_opportunities IS 
  'AI-safe read-only view of open opportunities. Exposes only public vacancy data with sanitized club info. No PII, no internal IDs, no contact information. Uses SECURITY INVOKER for RLS compliance.';

-- ============================================================================
-- GRANT ACCESS
-- ============================================================================

-- Allow anonymous (anon) role to read the view
-- This enables unauthenticated API access for AI agents
GRANT SELECT ON public.public_opportunities TO anon;
GRANT SELECT ON public.public_opportunities TO authenticated;
