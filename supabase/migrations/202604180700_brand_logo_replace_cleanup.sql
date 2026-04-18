-- Enqueue the old brand logo for cleanup when logo_url is replaced.
--
-- Audit bug M3. BrandForm uploads each logo under a new timestamped path
-- (`{user_id}/brand-logo-{Date.now()}.webp`) with `upsert: true`. Because the
-- path differs every time, upsert never overwrites — each re-upload leaves the
-- previous object in storage indefinitely.
--
-- Fix server-side: when `brands.logo_url` changes, enqueue the old storage
-- object (if it was an avatars-bucket public URL) for deletion. Consistent
-- with the existing queue-based cleanup for user_posts and brand_posts.
--
-- Account-deletion cleanup already sweeps the avatars bucket via the
-- delete-account edge function, so this only needs to cover the replace path.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.queue_brand_logo_cleanup_on_replace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket   TEXT := 'avatars';
  v_old_path TEXT;
BEGIN
  -- Only fire when the value actually changed.
  IF OLD.logo_url IS NOT DISTINCT FROM NEW.logo_url THEN
    RETURN NEW;
  END IF;

  IF OLD.logo_url IS NULL OR length(trim(OLD.logo_url)) = 0 THEN
    RETURN NEW;
  END IF;

  v_old_path := public.extract_storage_path(OLD.logo_url, v_bucket);
  IF v_old_path IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.storage_cleanup_queue (bucket_id, object_path, reason)
  VALUES (v_bucket, v_old_path, 'replaced brand logo for brand ' || NEW.id::TEXT)
  ON CONFLICT (bucket_id, object_path) WHERE processed_at IS NULL
    DO UPDATE SET reason     = EXCLUDED.reason,
                  queued_at  = timezone('utc', now()),
                  updated_at = timezone('utc', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_brand_logo_cleanup_on_replace ON public.brands;
CREATE TRIGGER trigger_queue_brand_logo_cleanup_on_replace
  AFTER UPDATE OF logo_url ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_brand_logo_cleanup_on_replace();

NOTIFY pgrst, 'reload schema';
