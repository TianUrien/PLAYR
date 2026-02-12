-- ============================================================================
-- Migration: Increase user-posts bucket file size limit for video uploads
-- Date: 2026-02-13
-- Description: The user-posts bucket inherited the global 50MB default, but
--   video uploads can be up to 100MB. Update the bucket-specific limit.
-- ============================================================================

UPDATE storage.buckets
SET file_size_limit = 104857600  -- 100 MB in bytes
WHERE id = 'user-posts';
