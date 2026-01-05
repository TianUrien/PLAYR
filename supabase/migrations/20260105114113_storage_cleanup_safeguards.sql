-- Add safeguards to prevent accidental storage deletion
-- 1. Self-test for extract_storage_path
-- 2. 7-day grace period before deletion

-- ============================================================================
-- Self-test: fail deployment if extract_storage_path is broken
-- ============================================================================
DO $$
DECLARE
  test_result TEXT;
BEGIN
  test_result := public.extract_storage_path(
    'https://example.supabase.co/storage/v1/object/public/avatars/user-id/file.jpg',
    'avatars'
  );
  IF test_result IS NULL OR test_result != 'user-id/file.jpg' THEN
    RAISE EXCEPTION 'extract_storage_path self-test FAILED: expected "user-id/file.jpg", got "%"', test_result;
  END IF;
END $$;

-- ============================================================================
-- Drop old function signature and create new one with grace period
-- ============================================================================
DROP FUNCTION IF EXISTS public.process_storage_cleanup_queue(INTEGER);

CREATE OR REPLACE FUNCTION public.process_storage_cleanup_queue(
  p_batch INTEGER DEFAULT 200,
  p_grace_period INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  processed INTEGER := 0;
  job RECORD;
BEGIN
  -- Only process items that have been queued for at least p_grace_period (default 7 days)
  -- This gives time to catch and fix bugs before files are permanently deleted
  FOR job IN
    SELECT id, bucket_id, object_path
    FROM public.storage_cleanup_queue
    WHERE processed_at IS NULL
      AND queued_at < timezone('utc', now()) - p_grace_period
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

COMMENT ON FUNCTION public.process_storage_cleanup_queue(INTEGER, INTERVAL) IS 'Deletes orphaned storage objects after a 7-day grace period. The grace period allows time to catch bugs before permanent deletion.';
