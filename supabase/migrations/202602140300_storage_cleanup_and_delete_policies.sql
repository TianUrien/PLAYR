-- ============================================================================
-- C3: Queue storage cleanup when user_posts or brand_posts are deleted
-- C4: Add explicit DELETE policy for profile_references
-- ============================================================================

BEGIN;

-- ============================================================================
-- C3 — Shared helper: enqueue media from a user_post images JSONB array
-- ============================================================================
-- Extracted as a standalone function so it can be called from both the
-- soft-delete trigger (UPDATE OF deleted_at) and the hard-delete trigger
-- (BEFORE DELETE, e.g. profile CASCADE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._enqueue_user_post_media(
  p_post_id  UUID,
  p_images   JSONB,
  p_reason   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item   JSONB;
  v_url    TEXT;
  v_path   TEXT;
  v_bucket TEXT := 'user-posts';
BEGIN
  IF p_images IS NULL OR jsonb_array_length(p_images) = 0 THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_images)
  LOOP
    -- Queue the main media URL
    v_url  := v_item ->> 'url';
    v_path := public.extract_storage_path(v_url, v_bucket);

    IF v_path IS NOT NULL THEN
      INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
      VALUES (v_bucket, v_path, p_reason)
      ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL
        DO UPDATE SET reason     = EXCLUDED.reason,
                      queued_at  = timezone('utc', now()),
                      updated_at = timezone('utc', now());
    END IF;

    -- Queue the thumbnail URL (videos have a separate thumb_url)
    v_url  := v_item ->> 'thumb_url';
    v_path := public.extract_storage_path(v_url, v_bucket);

    IF v_path IS NOT NULL THEN
      INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
      VALUES (v_bucket, v_path, p_reason || ' (thumbnail)')
      ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL
        DO UPDATE SET reason     = EXCLUDED.reason,
                      queued_at  = timezone('utc', now()),
                      updated_at = timezone('utc', now());
    END IF;
  END LOOP;
END;
$$;


-- ============================================================================
-- C3 — Trigger 1: soft-delete (UPDATE deleted_at NULL → non-NULL)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_post_media_cleanup_on_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire on first soft-delete (NULL → non-NULL)
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public._enqueue_user_post_media(
    NEW.id,
    NEW.images,
    'soft-deleted user_post ' || NEW.id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_post_media_cleanup ON public.user_posts;
CREATE TRIGGER trigger_queue_post_media_cleanup
  AFTER UPDATE OF deleted_at ON public.user_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_post_media_cleanup_on_soft_delete();


-- ============================================================================
-- C3 — Trigger 2: hard-delete (CASCADE from profile deletion)
-- ============================================================================
-- When a profile is hard-deleted via hard_delete_profile_relations(),
-- user_posts are CASCADE-deleted. The UPDATE trigger above never fires.
-- This BEFORE DELETE trigger catches that path and queues media cleanup.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_post_media_cleanup_on_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._enqueue_user_post_media(
    OLD.id,
    OLD.images,
    'hard-deleted user_post ' || OLD.id::TEXT
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_post_media_cleanup_on_delete ON public.user_posts;
CREATE TRIGGER trigger_queue_post_media_cleanup_on_delete
  BEFORE DELETE ON public.user_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_post_media_cleanup_on_hard_delete();


-- ============================================================================
-- C3 — brand_posts: soft-delete + hard-delete cleanup
-- ============================================================================
-- brand_posts store a single image_url (TEXT, not JSONB array).
-- Bucket is 'brand-posts'. brand_posts CASCADE from brands(id).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_brand_post_media_cleanup_on_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path   TEXT;
  v_bucket TEXT := 'brand-posts';
BEGIN
  IF NEW.deleted_at IS NULL OR OLD.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.image_url IS NULL OR length(trim(NEW.image_url)) = 0 THEN
    RETURN NEW;
  END IF;

  v_path := public.extract_storage_path(NEW.image_url, v_bucket);

  IF v_path IS NOT NULL THEN
    INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
    VALUES (v_bucket, v_path, 'soft-deleted brand_post ' || NEW.id::TEXT)
    ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL
      DO UPDATE SET reason     = EXCLUDED.reason,
                    queued_at  = timezone('utc', now()),
                    updated_at = timezone('utc', now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_brand_post_media_cleanup ON public.brand_posts;
CREATE TRIGGER trigger_queue_brand_post_media_cleanup
  AFTER UPDATE OF deleted_at ON public.brand_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_brand_post_media_cleanup_on_soft_delete();


CREATE OR REPLACE FUNCTION public.queue_brand_post_media_cleanup_on_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path   TEXT;
  v_bucket TEXT := 'brand-posts';
BEGIN
  IF OLD.image_url IS NULL OR length(trim(OLD.image_url)) = 0 THEN
    RETURN OLD;
  END IF;

  v_path := public.extract_storage_path(OLD.image_url, v_bucket);

  IF v_path IS NOT NULL THEN
    INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
    VALUES (v_bucket, v_path, 'hard-deleted brand_post ' || OLD.id::TEXT)
    ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL
      DO UPDATE SET reason     = EXCLUDED.reason,
                    queued_at  = timezone('utc', now()),
                    updated_at = timezone('utc', now());
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_brand_post_media_cleanup_on_delete ON public.brand_posts;
CREATE TRIGGER trigger_queue_brand_post_media_cleanup_on_delete
  BEFORE DELETE ON public.brand_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_brand_post_media_cleanup_on_hard_delete();


-- ============================================================================
-- C4 — Add explicit DELETE policies
-- ============================================================================
--
-- Vacancies: Already covered by "Clubs can manage their vacancies" FOR ALL
--            policy (SELECT + INSERT + UPDATE + DELETE for club owners).
--            vacancy_applications has ON DELETE CASCADE from vacancies.
--            No change needed.
--
-- Conversations: NOT adding a DELETE policy. messages has ON DELETE CASCADE
--                from conversations — if one participant deletes, the other
--                loses all their messages. This is too destructive. Keeping
--                default-deny (no hard-deletes). A future per-user archive
--                feature can handle "hide conversation" without data loss.
--
-- Profile references: The requester or reference-giver should be able to
--                     fully remove a reference (privacy / GDPR right to
--                     erasure). service_role also allowed for admin cleanup.
-- ============================================================================

DROP POLICY IF EXISTS "profile_references_delete" ON public.profile_references;
CREATE POLICY "profile_references_delete"
  ON public.profile_references
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR auth.uid() = requester_id
    OR auth.uid() = reference_id
  );

COMMIT;
