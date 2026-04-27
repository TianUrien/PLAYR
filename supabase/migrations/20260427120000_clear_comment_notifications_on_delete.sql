-- ============================================================================
-- Clear user_post_comment_received notifications on comment / post delete
-- ============================================================================
-- The 20260427100001 trigger fires a notification when someone comments
-- on your user_post. But when:
--   1. The commenter soft-deletes their comment, OR
--   2. The post owner soft-deletes the entire post,
-- the notification stayed in the recipient's inbox pointing to content
-- that's gone. Tap → /home → no visible comment → confused user.
--
-- This migration adds two triggers that mirror the existing
-- handle_profile_reference_notifications pattern (which clears
-- reference_request_received when status moves out of pending):
--
--   1. trg_clear_comment_notification_on_comment_delete
--      ON post_comments UPDATE OF deleted_at
--      WHEN deleted_at flips NULL → NOT NULL
--      → set cleared_at on the matching notification
--
--   2. trg_clear_comment_notifications_on_post_delete
--      ON user_posts UPDATE OF deleted_at
--      WHEN deleted_at flips NULL → NOT NULL
--      → set cleared_at on all notifications whose source_entity_id
--        is a comment belonging to this post
--
-- "Cleared" notifications stay in the table (soft-clear) but are
-- filtered out of the unread/list views by the existing fetch RPCs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_user_post_comment_notification_on_comment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on the NULL → NOT NULL transition (the actual soft-delete).
  -- Keeps this idempotent on no-op UPDATEs and on un-delete restores.
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.profile_notifications
       SET cleared_at = timezone('utc', now())
     WHERE kind = 'user_post_comment_received'
       AND source_entity_id = NEW.id
       AND cleared_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_comment_notification_on_comment_delete ON public.post_comments;

CREATE TRIGGER trg_clear_comment_notification_on_comment_delete
  AFTER UPDATE OF deleted_at ON public.post_comments
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.clear_user_post_comment_notification_on_comment_delete();

COMMENT ON FUNCTION public.clear_user_post_comment_notification_on_comment_delete IS
  'Clears the user_post_comment_received notification when its underlying comment is soft-deleted. Mirrors the reference_request cleared-on-resolve pattern.';

CREATE OR REPLACE FUNCTION public.clear_comment_notifications_on_post_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on the NULL → NOT NULL transition.
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.profile_notifications n
       SET cleared_at = timezone('utc', now())
      FROM public.post_comments c
     WHERE n.kind = 'user_post_comment_received'
       AND n.source_entity_id = c.id
       AND c.post_id = NEW.id
       AND n.cleared_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_comment_notifications_on_post_delete ON public.user_posts;

CREATE TRIGGER trg_clear_comment_notifications_on_post_delete
  AFTER UPDATE OF deleted_at ON public.user_posts
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.clear_comment_notifications_on_post_delete();

COMMENT ON FUNCTION public.clear_comment_notifications_on_post_delete IS
  'When a user_post is soft-deleted, clear any user_post_comment_received notifications referencing comments on that post. Prevents stale notifications pointing to a vanished post.';
