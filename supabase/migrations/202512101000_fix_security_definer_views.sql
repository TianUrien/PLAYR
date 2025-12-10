-- ============================================================================
-- SECURITY FIX: Convert Security Definer Views to Security Invoker
-- ============================================================================
-- This migration addresses Supabase Security Advisor warnings about views
-- defined with SECURITY DEFINER property. Converting to SECURITY INVOKER
-- ensures that views respect RLS policies of the querying user.
-- 
-- Affected views:
-- - public.user_unread_counts
-- - public.user_unread_counts_secure
-- - public.profile_friend_edges
-- - public.country_migration_stats
-- - public.profiles_pending_country_review
-- ============================================================================

BEGIN;

SET search_path = public;

-- ============================================================================
-- Fix 1: user_unread_counts views - Convert to SECURITY INVOKER
-- ============================================================================
-- These views wrap the user_unread_counters table which has proper RLS.
-- Converting to security_invoker ensures the underlying table's RLS is respected.

DROP VIEW IF EXISTS public.user_unread_counts_secure CASCADE;
DROP VIEW IF EXISTS public.user_unread_counts CASCADE;

CREATE VIEW public.user_unread_counts
WITH (security_invoker = true)
AS
SELECT user_id, unread_count, updated_at
FROM public.user_unread_counters;

CREATE VIEW public.user_unread_counts_secure
WITH (security_invoker = true)
AS
SELECT user_id, unread_count, updated_at
FROM public.user_unread_counters
WHERE user_id = auth.uid();

GRANT SELECT ON public.user_unread_counts TO authenticated;
GRANT SELECT ON public.user_unread_counts_secure TO authenticated;

COMMENT ON VIEW public.user_unread_counts IS 'Materialized unread counts per user (security invoker - respects RLS)';
COMMENT ON VIEW public.user_unread_counts_secure IS 'RLS wrapper exposing unread counts for the currently authenticated user (security invoker)';

-- ============================================================================
-- Fix 2: profile_friend_edges - Convert to SECURITY INVOKER
-- ============================================================================
-- This view creates a bidirectional friendship view from profile_friendships.
-- Converting to security_invoker ensures the underlying table's RLS is respected.

DROP VIEW IF EXISTS public.profile_friend_edges CASCADE;

CREATE VIEW public.profile_friend_edges
WITH (security_invoker = true)
AS
SELECT
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_one AS profile_id,
  pf.user_two AS friend_id
FROM public.profile_friendships pf
UNION ALL
SELECT
  pf.id,
  pf.user_one,
  pf.user_two,
  pf.requester_id,
  pf.status,
  pf.created_at,
  pf.updated_at,
  pf.accepted_at,
  pf.pair_key_lower,
  pf.pair_key_upper,
  pf.user_two AS profile_id,
  pf.user_one AS friend_id
FROM public.profile_friendships pf;

GRANT SELECT ON public.profile_friend_edges TO authenticated;

COMMENT ON VIEW public.profile_friend_edges IS 'Bidirectional friendship view (security invoker - respects RLS on profile_friendships)';

-- ============================================================================
-- Fix 3: country_migration_stats - Convert to SECURITY INVOKER
-- ============================================================================
-- Admin-only stats view. Converting to security_invoker and restricting grants.

DROP VIEW IF EXISTS public.country_migration_stats CASCADE;

CREATE VIEW public.country_migration_stats
WITH (security_invoker = true)
AS
SELECT
  (SELECT COUNT(*) FROM public.profiles WHERE onboarding_completed = TRUE) AS total_completed_profiles,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality IS NOT NULL AND TRIM(nationality) <> '') AS profiles_with_nationality_text,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality_country_id IS NOT NULL) AS profiles_with_nationality_id,
  (SELECT COUNT(*) FROM public.profiles WHERE nationality IS NOT NULL AND TRIM(nationality) <> '' AND nationality_country_id IS NULL) AS nationality_pending_review,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_1 IS NOT NULL AND TRIM(passport_1) <> '') AS profiles_with_passport1_text,
  (SELECT COUNT(*) FROM public.profiles WHERE passport1_country_id IS NOT NULL) AS profiles_with_passport1_id,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_1 IS NOT NULL AND TRIM(passport_1) <> '' AND passport1_country_id IS NULL) AS passport1_pending_review,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_2 IS NOT NULL AND TRIM(passport_2) <> '') AS profiles_with_passport2_text,
  (SELECT COUNT(*) FROM public.profiles WHERE passport2_country_id IS NOT NULL) AS profiles_with_passport2_id,
  (SELECT COUNT(*) FROM public.profiles WHERE passport_2 IS NOT NULL AND TRIM(passport_2) <> '' AND passport2_country_id IS NULL) AS passport2_pending_review;

-- Only grant to service_role (admin operations via edge functions)
REVOKE ALL ON public.country_migration_stats FROM authenticated;
GRANT SELECT ON public.country_migration_stats TO service_role;

COMMENT ON VIEW public.country_migration_stats IS 'Admin-only: Country data migration progress stats (security invoker)';

-- ============================================================================
-- Fix 4: profiles_pending_country_review - Convert to SECURITY INVOKER
-- ============================================================================
-- Admin-only view for manual country mapping review.

DROP VIEW IF EXISTS public.profiles_pending_country_review CASCADE;

CREATE VIEW public.profiles_pending_country_review
WITH (security_invoker = true)
AS
SELECT 
  p.id,
  p.full_name,
  p.email,
  p.role,
  p.nationality AS nationality_text,
  p.nationality_country_id,
  nc.name AS nationality_country_name,
  p.passport_1 AS passport1_text,
  p.passport1_country_id,
  p1c.name AS passport1_country_name,
  p.passport_2 AS passport2_text,
  p.passport2_country_id,
  p2c.name AS passport2_country_name,
  CASE 
    WHEN p.nationality IS NOT NULL AND TRIM(p.nationality) <> '' AND p.nationality_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS nationality_needs_review,
  CASE 
    WHEN p.passport_1 IS NOT NULL AND TRIM(p.passport_1) <> '' AND p.passport1_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS passport1_needs_review,
  CASE 
    WHEN p.passport_2 IS NOT NULL AND TRIM(p.passport_2) <> '' AND p.passport2_country_id IS NULL THEN TRUE
    ELSE FALSE
  END AS passport2_needs_review
FROM public.profiles p
LEFT JOIN public.countries nc ON nc.id = p.nationality_country_id
LEFT JOIN public.countries p1c ON p1c.id = p.passport1_country_id
LEFT JOIN public.countries p2c ON p2c.id = p.passport2_country_id
WHERE 
  (p.nationality IS NOT NULL AND TRIM(p.nationality) <> '' AND p.nationality_country_id IS NULL)
  OR (p.passport_1 IS NOT NULL AND TRIM(p.passport_1) <> '' AND p.passport1_country_id IS NULL)
  OR (p.passport_2 IS NOT NULL AND TRIM(p.passport_2) <> '' AND p.passport2_country_id IS NULL);

-- Only grant to service_role (admin operations)
REVOKE ALL ON public.profiles_pending_country_review FROM authenticated;
GRANT SELECT ON public.profiles_pending_country_review TO service_role;

COMMENT ON VIEW public.profiles_pending_country_review IS 'Admin-only: Profiles needing country field review (security invoker)';

COMMIT;
