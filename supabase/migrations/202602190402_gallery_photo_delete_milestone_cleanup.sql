-- ============================================================================
-- Gallery Photo Delete → Milestone Cleanup Trigger
-- ============================================================================
-- When a gallery photo is deleted:
--   1. If the deleted photo's URL matches the milestone's image_url:
--      a. If other photos remain → update milestone metadata to the next photo
--      b. If no photos remain → soft-delete the milestone feed item
--         and remove the profile_milestones row (so it can re-trigger later)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_gallery_photo_delete_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feed_item_id UUID;
  v_current_image_url TEXT;
  v_next_photo_url TEXT;
  v_remaining_count INTEGER;
BEGIN
  -- Find the milestone feed item for this user's first_gallery_image
  SELECT hfi.id, hfi.metadata->>'image_url'
  INTO v_feed_item_id, v_current_image_url
  FROM home_feed_items hfi
  WHERE hfi.item_type = 'milestone_achieved'
    AND hfi.metadata->>'milestone_type' = 'first_gallery_image'
    AND hfi.metadata->>'profile_id' = OLD.user_id::TEXT
    AND hfi.deleted_at IS NULL;

  -- No active milestone feed item for this user — nothing to do
  IF v_feed_item_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Only act if the deleted photo is the one shown in the milestone
  IF v_current_image_url IS DISTINCT FROM OLD.photo_url THEN
    RETURN OLD;
  END IF;

  -- Count remaining gallery photos for this user
  SELECT COUNT(*) INTO v_remaining_count
  FROM gallery_photos
  WHERE user_id = OLD.user_id
    AND id != OLD.id;

  IF v_remaining_count > 0 THEN
    -- Pick the most recent remaining photo as the new image
    SELECT gp.photo_url INTO v_next_photo_url
    FROM gallery_photos gp
    WHERE gp.user_id = OLD.user_id
      AND gp.id != OLD.id
    ORDER BY gp.created_at DESC
    LIMIT 1;

    -- Update the milestone metadata with the new image URL
    UPDATE home_feed_items
    SET metadata = jsonb_set(metadata, '{image_url}', to_jsonb(v_next_photo_url))
    WHERE id = v_feed_item_id;
  ELSE
    -- No photos remain — soft-delete the milestone feed item
    UPDATE home_feed_items
    SET deleted_at = now()
    WHERE id = v_feed_item_id;

    -- Remove the profile_milestones row so the milestone can re-trigger
    -- if the user uploads a new gallery photo later
    DELETE FROM profile_milestones
    WHERE profile_id = OLD.user_id
      AND milestone_type = 'first_gallery_image';
  END IF;

  RETURN OLD;
END;
$$;

-- Trigger: AFTER DELETE on gallery_photos
DROP TRIGGER IF EXISTS trg_gallery_photo_delete_milestone ON gallery_photos;
CREATE TRIGGER trg_gallery_photo_delete_milestone
  AFTER DELETE ON gallery_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_gallery_photo_delete_milestone();
