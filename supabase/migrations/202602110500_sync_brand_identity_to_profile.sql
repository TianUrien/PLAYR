-- ============================================================================
-- Migration: Sync Brand Identity to Profile
-- Date: 2026-02-11
-- Description: Brand accounts store their name in `brands.name` and their
--   logo in `brands.logo_url`, but many parts of the app read
--   `profiles.full_name` and `profiles.avatar_url` as the universal display
--   identity (Community listings, Messages, Header, Post Composer, etc.).
--
--   For brand accounts, `profiles.full_name` was never populated — it stayed
--   NULL from signup. This caused brand names to appear blank/empty across
--   every section that reads `profiles.full_name`.
--
--   Fix: Create a trigger that syncs `brands.name` → `profiles.full_name`
--   and `brands.logo_url` → `profiles.avatar_url` on INSERT and UPDATE.
--   Also backfill all existing brand accounts.
--
--   This makes `profiles.full_name` the single source of truth for display
--   name across ALL roles, and eliminates the need for COALESCE workarounds.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. TRIGGER: Sync brand identity → profile on INSERT/UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_brand_identity_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name  = NEW.name,
    avatar_url = COALESCE(NEW.logo_url, avatar_url)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_brand_identity ON public.brands;
CREATE TRIGGER trigger_sync_brand_identity
  AFTER INSERT OR UPDATE OF name, logo_url ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_brand_identity_to_profile();

-- ============================================================================
-- 2. BACKFILL: Populate profiles.full_name for all existing brand accounts
-- ============================================================================

UPDATE public.profiles p
SET
  full_name  = b.name,
  avatar_url = COALESCE(b.logo_url, p.avatar_url)
FROM public.brands b
WHERE b.profile_id = p.id
  AND (p.full_name IS NULL OR p.full_name = '' OR p.full_name != b.name);

COMMENT ON FUNCTION public.sync_brand_identity_to_profile IS 'Keeps profiles.full_name and profiles.avatar_url in sync with brands.name and brands.logo_url. Ensures brand identity is consistent across all sections that read from the profiles table.';
