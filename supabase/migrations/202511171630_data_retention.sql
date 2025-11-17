-- Data retention & archival strategy for messages, notifications, and storage buckets
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SET search_path = public;

-- ============================================================================
-- Archived messages table keeps historical DM context while trimming hot table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.archived_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  idempotency_key TEXT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.archived_messages IS 'Historical DM messages moved out of the hot messages table for long-term retention.';
COMMENT ON COLUMN public.archived_messages.archived_at IS 'Timestamp when the row was moved out of public.messages.';

CREATE INDEX IF NOT EXISTS idx_archived_messages_conversation
  ON public.archived_messages (conversation_id, sent_at);

-- ============================================================================
-- Helper to normalize Supabase storage URLs down to bucket-relative paths
-- ============================================================================
CREATE OR REPLACE FUNCTION public.extract_storage_path(p_url TEXT, p_bucket TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized TEXT;
  marker TEXT;
  idx INTEGER;
BEGIN
  IF p_url IS NULL OR p_bucket IS NULL OR length(trim(p_url)) = 0 THEN
    RETURN NULL;
  END IF;

  normalized := regexp_replace(p_url, '^https?://[^/]+', '');
  normalized := regexp_replace(normalized, '\\?.*$', '');

  marker := '/storage/v1/object/public/' || p_bucket || '/';
  idx := POSITION(marker IN normalized);
  IF idx > 0 THEN
    RETURN SUBSTRING(normalized FROM idx + CHAR_LENGTH(marker));
  END IF;

  marker := p_bucket || '/';
  IF left(normalized, CHAR_LENGTH(marker)) = marker THEN
    RETURN SUBSTRING(normalized FROM CHAR_LENGTH(marker) + 1);
  END IF;

  idx := POSITION(marker IN normalized);
  IF idx > 0 THEN
    RETURN SUBSTRING(normalized FROM idx + CHAR_LENGTH(marker));
  END IF;

  RETURN NULL;
END;
$$;

-- ============================================================================
-- Storage cleanup queue tracks orphaned objects slated for removal
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.storage_cleanup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id TEXT NOT NULL,
  object_path TEXT NOT NULL,
  reason TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  processed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT storage_cleanup_queue_object_path_not_blank CHECK (length(trim(object_path)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS storage_cleanup_queue_pending_idx
  ON public.storage_cleanup_queue (bucket_id, object_path)
  WHERE processed_at IS NULL;

COMMENT ON TABLE public.storage_cleanup_queue IS 'Queue of Supabase Storage objects that can be safely deleted once no referencing records remain.';

-- ============================================================================
-- Archive/read retention routines
-- ============================================================================
CREATE OR REPLACE FUNCTION public.archive_old_messages(
  p_retention_days INTEGER DEFAULT 365,
  p_batch INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  removed_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT *
    FROM public.messages
    WHERE sent_at < timezone('utc', now()) - make_interval(days => p_retention_days)
      AND (read_at IS NOT NULL OR timezone('utc', now()) - sent_at > INTERVAL '540 days')
    ORDER BY sent_at
    LIMIT p_batch
  ), inserted AS (
    INSERT INTO public.archived_messages (id, conversation_id, sender_id, content, sent_at, read_at, idempotency_key)
    SELECT id, conversation_id, sender_id, content, sent_at, read_at, idempotency_key
    FROM candidates
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ), deleted AS (
    DELETE FROM public.messages
    WHERE id IN (SELECT id FROM inserted)
    RETURNING id
  )
  SELECT COUNT(*) INTO removed_count FROM deleted;

  RETURN COALESCE(removed_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_profile_notifications(
  p_visible_days INTEGER DEFAULT 90,
  p_cleared_days INTEGER DEFAULT 30,
  p_batch INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  WITH doomed AS (
    SELECT id
    FROM public.profile_notifications
    WHERE (
      cleared_at IS NULL AND created_at < timezone('utc', now()) - make_interval(days => p_visible_days)
    ) OR (
      cleared_at IS NOT NULL AND cleared_at < timezone('utc', now()) - make_interval(days => p_cleared_days)
    )
    ORDER BY created_at
    LIMIT p_batch
  ), deleted AS (
    DELETE FROM public.profile_notifications
    WHERE id IN (SELECT id FROM doomed)
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN COALESCE(deleted_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_orphaned_storage_objects(
  p_limit INTEGER DEFAULT 500,
  p_min_age INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  WITH avatar_refs AS (
    SELECT DISTINCT public.extract_storage_path(avatar_url, 'avatars') AS path
    FROM public.profiles
    WHERE avatar_url IS NOT NULL
  ), gallery_refs AS (
    SELECT DISTINCT public.extract_storage_path(photo_url, 'gallery') AS path
    FROM public.gallery_photos
    WHERE photo_url IS NOT NULL
  ), club_refs AS (
    SELECT DISTINCT public.extract_storage_path(file_url, 'club-media') AS path
    FROM public.club_media
    WHERE file_url IS NOT NULL
  ), journey_refs AS (
    SELECT DISTINCT public.extract_storage_path(image_url, 'journey') AS path
    FROM public.playing_history
    WHERE image_url IS NOT NULL
  ), candidate_objects AS (
    SELECT bucket_id, name, reason
    FROM (
      SELECT o.bucket_id, o.name, 'orphaned avatar' AS reason
      FROM storage.objects o
      WHERE o.bucket_id = 'avatars'
        AND o.created_at < timezone('utc', now()) - p_min_age
        AND NOT EXISTS (SELECT 1 FROM avatar_refs ar WHERE ar.path = o.name)
      UNION ALL
      SELECT o.bucket_id, o.name, 'orphaned gallery photo' AS reason
      FROM storage.objects o
      WHERE o.bucket_id = 'gallery'
        AND o.created_at < timezone('utc', now()) - p_min_age
        AND NOT EXISTS (SELECT 1 FROM gallery_refs gr WHERE gr.path = o.name)
      UNION ALL
      SELECT o.bucket_id, o.name, 'orphaned club media' AS reason
      FROM storage.objects o
      WHERE o.bucket_id = 'club-media'
        AND o.created_at < timezone('utc', now()) - p_min_age
        AND NOT EXISTS (SELECT 1 FROM club_refs cr WHERE cr.path = o.name)
      UNION ALL
      SELECT o.bucket_id, o.name, 'orphaned journey image' AS reason
      FROM storage.objects o
      WHERE o.bucket_id = 'journey'
        AND o.created_at < timezone('utc', now()) - p_min_age
        AND NOT EXISTS (SELECT 1 FROM journey_refs jr WHERE jr.path = o.name)
    ) collected
    ORDER BY bucket_id, name
    LIMIT p_limit
  ), inserted AS (
    INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
    SELECT c.bucket_id, c.name, c.reason
    FROM candidate_objects c
    ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL DO UPDATE
      SET reason = EXCLUDED.reason,
          queued_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
    RETURNING id
  )
  SELECT COUNT(*) INTO inserted_count FROM inserted;

  RETURN COALESCE(inserted_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_storage_cleanup_queue(
  p_batch INTEGER DEFAULT 200
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  processed INTEGER := 0;
  job RECORD;
BEGIN
  FOR job IN
    SELECT id, bucket_id, object_path
    FROM public.storage_cleanup_queue
    WHERE processed_at IS NULL
    ORDER BY queued_at
    LIMIT p_batch
  LOOP
    BEGIN
      DELETE FROM storage.objects
      WHERE bucket_id = job.bucket_id
        AND name = job.object_path;

      UPDATE public.storage_cleanup_queue
      SET processed_at = timezone('utc', now()),
          updated_at = timezone('utc', now()),
          last_error = NULL
      WHERE id = job.id;

      processed := processed + 1;
    EXCEPTION WHEN others THEN
      UPDATE public.storage_cleanup_queue
      SET attempts = attempts + 1,
          last_error = SQLERRM,
          updated_at = timezone('utc', now())
      WHERE id = job.id;
    END;
  END LOOP;

  RETURN processed;
END;
$$;

-- ============================================================================
-- Schedule recurring retention jobs (idempotent via jobname deletes)
-- ============================================================================
DO $$
BEGIN
  BEGIN
    DELETE FROM cron.job WHERE jobname IN (
      'archive_messages_daily',
      'prune_profile_notifications_daily',
      'storage_cleanup_enqueue',
      'storage_cleanup_process'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping cron job cleanup: insufficient privileges';
  END;

  BEGIN
    PERFORM cron.schedule('archive_messages_daily', '15 02 * * *', 'SELECT public.archive_old_messages();');
    PERFORM cron.schedule('prune_profile_notifications_daily', '0 03 * * *', 'SELECT public.prune_profile_notifications();');
    PERFORM cron.schedule('storage_cleanup_enqueue', '30 03 * * *', 'SELECT public.enqueue_orphaned_storage_objects();');
    PERFORM cron.schedule('storage_cleanup_process', '0 4 * * *', 'SELECT public.process_storage_cleanup_queue();');
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping cron job scheduling: insufficient privileges';
  END;
END;
$$;

COMMIT;
