-- =============================================================================
-- Fix: Clean up orphaned records when an opportunity is hard-deleted
-- =============================================================================
-- When an opportunity is deleted:
--   1. opportunity_applications → handled by ON DELETE CASCADE (FK)
--   2. home_feed_items → orphaned (polymorphic source_id, no FK)
--   3. profile_notifications → orphaned in two ways:
--      a. 'opportunity_published' notifications where source_entity_id = opportunity.id
--      b. 'vacancy_application_received/status' notifications where
--         source_entity_id = application.id (applications cascade-delete first,
--         but notifications have no FK to applications)
--   4. events → intentionally left alone (historical analytics data)
--
-- This trigger runs BEFORE DELETE to capture application IDs before they cascade.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_on_opportunity_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Soft-delete feed items referencing this opportunity
  UPDATE home_feed_items
  SET deleted_at = now()
  WHERE item_type = 'opportunity_posted'
    AND source_id = OLD.id
    AND deleted_at IS NULL;

  -- 2. Delete 'opportunity_published' notifications (source_entity_id = opportunity id)
  DELETE FROM profile_notifications
  WHERE kind = 'opportunity_published'
    AND source_entity_id = OLD.id;

  -- 3. Delete application-related notifications before applications cascade-delete
  --    (source_entity_id = application id)
  DELETE FROM profile_notifications
  WHERE kind IN ('vacancy_application_received', 'vacancy_application_status')
    AND source_entity_id IN (
      SELECT id FROM opportunity_applications WHERE opportunity_id = OLD.id
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_cleanup_on_opportunity_delete ON public.opportunities;
CREATE TRIGGER trigger_cleanup_on_opportunity_delete
  BEFORE DELETE ON public.opportunities
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_on_opportunity_delete();
