-- Adds captioning + metadata support to gallery photos for consistent media UX
BEGIN;

ALTER TABLE public.gallery_photos
  ADD COLUMN IF NOT EXISTS caption TEXT,
  ADD COLUMN IF NOT EXISTS alt_text TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gallery_photos_file_size_check'
  ) THEN
    ALTER TABLE public.gallery_photos
      ADD CONSTRAINT gallery_photos_file_size_check
      CHECK (file_size IS NULL OR file_size >= 0);
  END IF;
END $$;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC) - 1 AS idx
  FROM public.gallery_photos
)
UPDATE public.gallery_photos AS gp
SET
  order_index = COALESCE(ranked.idx, gp.order_index),
  file_name = COALESCE(
    gp.file_name,
    NULLIF(regexp_replace(gp.photo_url, '^.*/', ''), ''),
    'photo_' || gp.id || '.jpg'
  ),
  file_size = COALESCE(gp.file_size, 0),
  updated_at = COALESCE(gp.updated_at, gp.created_at)
FROM ranked
WHERE gp.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_gallery_photos_user_order
  ON public.gallery_photos (user_id, order_index, created_at DESC);

COMMENT ON COLUMN public.gallery_photos.caption IS 'Optional caption shown below gallery photo thumbnails.';
COMMENT ON COLUMN public.gallery_photos.alt_text IS 'Optional accessibility text for screen readers/lightbox.';
COMMENT ON COLUMN public.gallery_photos.file_name IS 'Original file name for the uploaded image.';
COMMENT ON COLUMN public.gallery_photos.file_size IS 'File size in bytes, tracked for quota enforcement.';
COMMENT ON COLUMN public.gallery_photos.order_index IS 'Per-user ordering so photos can be rearranged.';
COMMENT ON COLUMN public.gallery_photos.updated_at IS 'Timestamp for the last metadata update.';

COMMIT;
