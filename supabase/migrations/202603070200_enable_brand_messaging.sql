-- ============================================================================
-- Migration: Enable brand messaging
-- ============================================================================
-- Previously, brands were fully blocked from initiating conversations via a
-- BEFORE INSERT trigger on conversations. This was an early alpha constraint
-- that is no longer appropriate — brands need to message players they want
-- to sponsor, contact potential ambassadors, and engage with the community.
--
-- This migration drops the blocking trigger entirely, allowing brands to
-- start conversations like any other role.
-- ============================================================================

SET search_path = public;

-- Drop the blocking trigger
DROP TRIGGER IF EXISTS prevent_brand_conversation_initiation ON public.conversations;

-- Keep the function for reference but it's no longer attached
-- (dropping functions that might be referenced elsewhere is risky)
