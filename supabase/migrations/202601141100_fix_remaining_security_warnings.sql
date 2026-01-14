-- 202601141100_fix_remaining_security_warnings.sql
-- Security: Fix remaining Security Advisor warnings
--
-- Fixes:
-- 1. Add SET search_path to 3 missed functions
-- 2. Fix overly permissive RLS policy on error_logs table

SET search_path = public;

-- ============================================================================
-- 1. FIX FUNCTION SEARCH PATHS (3 missed functions)
-- ============================================================================

-- 1.1 archive_old_messages
CREATE OR REPLACE FUNCTION public.archive_old_messages(
  p_retention_days INTEGER DEFAULT 365,
  p_batch INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
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

-- 1.2 prune_profile_notifications
CREATE OR REPLACE FUNCTION public.prune_profile_notifications(
  p_visible_days INTEGER DEFAULT 90,
  p_cleared_days INTEGER DEFAULT 30,
  p_batch INTEGER DEFAULT 5000
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
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

-- 1.3 enqueue_orphaned_storage_objects
CREATE OR REPLACE FUNCTION public.enqueue_orphaned_storage_objects(
  p_limit INTEGER DEFAULT 500,
  p_min_age INTERVAL DEFAULT INTERVAL '30 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public, storage
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

-- ============================================================================
-- 2. FIX RLS POLICY ALWAYS TRUE on error_logs
-- The previous policies used WITH CHECK (true) which is overly permissive.
-- Replace with more restrictive policies that validate the user_id matches.
-- ============================================================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Authenticated can insert error logs" ON public.error_logs;

-- Recreate with proper restriction: users can only insert logs for themselves
CREATE POLICY "Authenticated can insert own error logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Note: The service_role policy with WITH CHECK (true) is acceptable because
-- service_role is a trusted backend role that bypasses RLS anyway.
-- However, we can make it explicit for documentation purposes.

-- ============================================================================
-- 3. EXTENSION IN PUBLIC (pg_trgm)
-- This is intentional - pg_trgm is used for fuzzy text matching in 
-- match_text_to_country and other functions. Moving it to a separate schema
-- would require updating all function references and is not necessary for
-- security. This warning can be safely ignored.
-- ============================================================================

-- ============================================================================
-- 4. LEAKED PASSWORD PROTECTION DISABLED
-- This is a Supabase Auth setting that must be enabled in the Supabase Dashboard:
-- 1. Go to Authentication > Settings > Security
-- 2. Enable "Leaked password protection"
-- This checks passwords against known breach databases (HaveIBeenPwned).
-- ============================================================================
