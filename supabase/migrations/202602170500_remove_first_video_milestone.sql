-- ============================================================================
-- Migration: Remove first_video milestone from Home feed
-- Date: 2026-02-17
-- Description: Highlight video uploads should no longer generate a milestone
--   in the Home feed. This migration:
--   1. Drops the trigger that creates first_video milestones
--   2. Drops the trigger that cleans up first_video milestones on video delete
--   3. Soft-deletes all existing first_video feed items
--   4. Removes first_video from profile_milestones
--   5. Removes first_video from the CHECK constraint
--   6. Drops the now-unused functions
-- ============================================================================

SET search_path = public;

-- 1. Drop triggers
DROP TRIGGER IF EXISTS trigger_first_video_milestone ON profiles;
DROP TRIGGER IF EXISTS trg_video_delete_milestone ON profiles;

-- 2. Soft-delete all existing first_video feed items
UPDATE home_feed_items
SET deleted_at = now()
WHERE item_type = 'milestone_achieved'
  AND deleted_at IS NULL
  AND metadata->>'milestone_type' = 'first_video';

-- 3. Remove from profile_milestones
DELETE FROM profile_milestones
WHERE milestone_type = 'first_video';

-- 4. Update CHECK constraint — remove first_video
ALTER TABLE profile_milestones
  DROP CONSTRAINT IF EXISTS profile_milestones_milestone_type_check;

ALTER TABLE profile_milestones
  ADD CONSTRAINT profile_milestones_milestone_type_check
  CHECK (milestone_type IN (
    'first_gallery_image',
    'profile_100_percent',
    'first_reference_received'
  ));

-- 5. Drop the now-unused functions
DROP FUNCTION IF EXISTS public.check_first_video_milestone() CASCADE;
DROP FUNCTION IF EXISTS public.handle_video_delete_milestone() CASCADE;
