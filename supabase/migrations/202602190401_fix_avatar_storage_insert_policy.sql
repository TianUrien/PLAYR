-- Fix: Align avatar INSERT policy with all other storage buckets.
--
-- The original migration (202511130105) created the avatar INSERT policy
-- without the path ownership check (split_part(name, '/', 1) = auth.uid()),
-- while every other bucket (gallery, club-media, player-media, journey)
-- includes it.  The setup script (005_storage.sql) has the stricter version
-- and may or may not have been applied to production.
--
-- This migration ensures the correct policy is in place regardless of prior
-- state.  The path check enforces that users can only upload into their own
-- directory (e.g. {userId}/avatar_*.jpg), which the frontend already does.

BEGIN;

DROP POLICY IF EXISTS "Users upload avatars" ON storage.objects;

CREATE POLICY "Users upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

COMMIT;
