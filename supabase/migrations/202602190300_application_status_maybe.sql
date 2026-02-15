-- =============================================================================
-- Add 'maybe' value to application_status enum
-- =============================================================================
-- Supports the 3-tier candidate shortlisting workflow:
--   shortlisted = good fit
--   maybe       = not sure yet
--   rejected    = not a fit
-- =============================================================================

ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'maybe' AFTER 'shortlisted';
