-- ============================================================================
-- Migration: Add metadata column to messages for shared posts
-- Date: 2026-02-14
-- Description: Adds a nullable JSONB metadata column to the messages table
--   to support structured message types (shared posts, etc.) alongside
--   the existing plain-text content field.
-- ============================================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Partial index for efficient filtering by metadata type
CREATE INDEX IF NOT EXISTS idx_messages_metadata_type
  ON public.messages ((metadata->>'type'))
  WHERE metadata IS NOT NULL;
