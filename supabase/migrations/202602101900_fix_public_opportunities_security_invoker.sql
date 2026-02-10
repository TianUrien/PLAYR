-- ============================================================================
-- Migration: Restore SECURITY INVOKER on public_opportunities view
-- Date: 2026-02-10
-- Description: Migrations 202602040300 and 202602040400 used
--   CREATE OR REPLACE VIEW without WITH (security_invoker = true),
--   which reset the view to SECURITY DEFINER (the default). This
--   was flagged by Supabase Security Advisor. Restoring the option
--   so the view runs with the querying user's permissions.
-- ============================================================================

ALTER VIEW public.public_opportunities SET (security_invoker = true);
