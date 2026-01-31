-- ============================================================================
-- Highlight Video Visibility Toggle
--
-- Adds a highlight_visibility column to profiles so players can control
-- whether their highlight video is visible to everyone or only to
-- clubs/coaches (recruiters).
--
-- Default: 'public' (no behavior change for existing users)
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS highlight_visibility TEXT NOT NULL DEFAULT 'public';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_highlight_visibility_check
  CHECK (highlight_visibility IN ('public', 'recruiters'));

COMMENT ON COLUMN public.profiles.highlight_visibility
  IS 'Controls who can see the highlight video: public (everyone) or recruiters (clubs + coaches only).';
