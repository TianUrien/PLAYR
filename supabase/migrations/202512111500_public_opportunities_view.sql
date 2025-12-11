-- Migration: Create public_opportunities view for AI-friendly API
-- This view exposes ONLY public, safe vacancy data for external consumption
-- 
-- Public data: vacancy details, club name/logo, location, timing, benefits
-- Private data (NOT exposed): club_id, contact info, internal notes, application counts

-- ============================================================================
-- PUBLIC OPPORTUNITIES VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.public_opportunities AS
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
  'AI-safe read-only view of open opportunities. Exposes only public vacancy data with sanitized club info. No PII, no internal IDs, no contact information.';

-- ============================================================================
-- GRANT ACCESS
-- ============================================================================

-- Allow anonymous (anon) role to read the view
-- This enables unauthenticated API access for AI agents
GRANT SELECT ON public.public_opportunities TO anon;
GRANT SELECT ON public.public_opportunities TO authenticated;

-- Note: No INSERT, UPDATE, DELETE permissions - this is strictly read-only
