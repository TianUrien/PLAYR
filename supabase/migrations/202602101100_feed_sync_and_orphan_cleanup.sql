-- ============================================================================
-- FEED DENORMALIZATION SYNC + ORPHAN CLEANUP
-- ============================================================================
-- Fixes two data integrity issues:
--   1. Feed metadata goes stale when profiles/opportunities/brands change
--   2. Feed items become orphans when their source is deleted
--
-- Adds 4 triggers:
--   A. Profile name/avatar sync → member_joined, milestone, reference items
--   B. Opportunity title sync → opportunity_posted items
--   C. Brand name/logo sync → brand_post, brand_product items
--   D. Source deletion → soft-delete corresponding feed items
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- A. PROFILE CHANGES → SYNC FEED METADATA
-- ============================================================================
-- When a profile's full_name or avatar_url changes, update all feed items
-- that reference this profile in their metadata.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_to_feed_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when name or avatar actually changed
  IF OLD.full_name IS NOT DISTINCT FROM NEW.full_name
     AND OLD.avatar_url IS NOT DISTINCT FROM NEW.avatar_url THEN
    RETURN NEW;
  END IF;

  -- 1. Update member_joined items (source_id = profile.id)
  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('full_name', NEW.full_name)
    || jsonb_build_object('avatar_url', NEW.avatar_url)
  WHERE item_type = 'member_joined'
    AND source_id = NEW.id
    AND deleted_at IS NULL;

  -- 2. Update milestone_achieved items (metadata->>'profile_id' = profile.id)
  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('full_name', NEW.full_name)
    || jsonb_build_object('avatar_url', NEW.avatar_url)
  WHERE item_type = 'milestone_achieved'
    AND metadata->>'profile_id' = NEW.id::text
    AND deleted_at IS NULL;

  -- 3. Update reference_received items where this profile is the requester
  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('full_name', NEW.full_name)
    || jsonb_build_object('avatar_url', NEW.avatar_url)
  WHERE item_type = 'reference_received'
    AND metadata->>'profile_id' = NEW.id::text
    AND deleted_at IS NULL;

  -- 4. Update reference_received items where this profile is the referee
  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('referee_name', NEW.full_name)
    || jsonb_build_object('referee_avatar', NEW.avatar_url)
  WHERE item_type = 'reference_received'
    AND metadata->>'referee_id' = NEW.id::text
    AND deleted_at IS NULL;

  -- 5. Update opportunity_posted items where this profile is the club
  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('club_name', NEW.full_name)
    || jsonb_build_object('club_logo', NEW.avatar_url)
  WHERE item_type = 'opportunity_posted'
    AND metadata->>'club_id' = NEW.id::text
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_profile_feed_metadata ON public.profiles;
CREATE TRIGGER trigger_sync_profile_feed_metadata
  AFTER UPDATE OF full_name, avatar_url ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_to_feed_metadata();

-- ============================================================================
-- B. OPPORTUNITY CHANGES → SYNC FEED METADATA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_opportunity_to_feed_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when title or location changed
  IF OLD.title IS NOT DISTINCT FROM NEW.title
     AND OLD.location_city IS NOT DISTINCT FROM NEW.location_city
     AND OLD.location_country IS NOT DISTINCT FROM NEW.location_country THEN
    RETURN NEW;
  END IF;

  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('title', NEW.title)
    || jsonb_build_object('location_city', NEW.location_city)
    || jsonb_build_object('location_country', NEW.location_country)
  WHERE item_type = 'opportunity_posted'
    AND source_id = NEW.id
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_opportunity_feed_metadata ON public.opportunities;
CREATE TRIGGER trigger_sync_opportunity_feed_metadata
  AFTER UPDATE OF title, location_city, location_country ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_opportunity_to_feed_metadata();

-- ============================================================================
-- C. BRAND CHANGES → SYNC FEED METADATA
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_brand_to_feed_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.name IS NOT DISTINCT FROM NEW.name
     AND OLD.logo_url IS NOT DISTINCT FROM NEW.logo_url THEN
    RETURN NEW;
  END IF;

  UPDATE home_feed_items
  SET metadata = metadata
    || jsonb_build_object('brand_name', NEW.name)
    || jsonb_build_object('brand_logo_url', NEW.logo_url)
  WHERE item_type IN ('brand_post', 'brand_product')
    AND metadata->>'brand_id' = NEW.id::text
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_brand_feed_metadata ON public.brands;
CREATE TRIGGER trigger_sync_brand_feed_metadata
  AFTER UPDATE OF name, logo_url ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_brand_to_feed_metadata();

-- ============================================================================
-- D. SOURCE DELETION → SOFT-DELETE FEED ITEMS
-- ============================================================================

-- D1. Profile deleted → soft-delete their member_joined + milestone items
CREATE OR REPLACE FUNCTION public.cleanup_feed_on_profile_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE home_feed_items
  SET deleted_at = now()
  WHERE deleted_at IS NULL
    AND (
      -- member_joined items for this profile
      (item_type = 'member_joined' AND source_id = OLD.id)
      -- milestone items for this profile
      OR (item_type = 'milestone_achieved' AND metadata->>'profile_id' = OLD.id::text)
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cleanup_feed_on_profile_delete ON public.profiles;
CREATE TRIGGER trigger_cleanup_feed_on_profile_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_feed_on_profile_delete();

-- D2. Opportunity closed/deleted → soft-delete feed item
CREATE OR REPLACE FUNCTION public.cleanup_feed_on_opportunity_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Soft-delete feed item when opportunity status changes away from 'open'
  IF OLD.status = 'open' AND NEW.status != 'open' THEN
    UPDATE home_feed_items
    SET deleted_at = now()
    WHERE item_type = 'opportunity_posted'
      AND source_id = NEW.id
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cleanup_feed_on_opportunity_close ON public.opportunities;
CREATE TRIGGER trigger_cleanup_feed_on_opportunity_close
  AFTER UPDATE OF status ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_feed_on_opportunity_close();

-- D3. Brand soft-deleted → soft-delete their feed items
CREATE OR REPLACE FUNCTION public.cleanup_feed_on_brand_softdelete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When brand gets soft-deleted (deleted_at goes from NULL to a value)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE home_feed_items
    SET deleted_at = now()
    WHERE item_type IN ('brand_post', 'brand_product')
      AND metadata->>'brand_id' = NEW.id::text
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cleanup_feed_on_brand_softdelete ON public.brands;
CREATE TRIGGER trigger_cleanup_feed_on_brand_softdelete
  AFTER UPDATE OF deleted_at ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_feed_on_brand_softdelete();
