-- ============================================================================
-- SECURITY FIX: Enable RLS on Tables Missing Row Level Security
-- ============================================================================
-- This migration addresses Supabase Security Advisor warnings about tables
-- in the public schema that don't have RLS enabled. These tables are exposed
-- via the auto-generated REST API and could leak data without proper policies.
-- 
-- Affected tables:
-- - public.user_unread_senders (HIGH RISK - messaging metadata)
-- - public.archived_messages (MEDIUM RISK - historical message content)
-- - public.storage_cleanup_queue (LOW RISK - internal cleanup)
-- - public.country_text_aliases (LOW RISK - public reference data)
-- ============================================================================

BEGIN;

SET search_path = public;

-- ============================================================================
-- Fix 1: user_unread_senders - CRITICAL
-- ============================================================================
-- This table tracks per-sender unread message counts for each user.
-- Without RLS, any authenticated user could see who is messaging whom.

ALTER TABLE public.user_unread_senders ENABLE ROW LEVEL SECURITY;

-- Users can only view their own unread sender records
DROP POLICY IF EXISTS "Users can view their own unread senders" ON public.user_unread_senders;
CREATE POLICY "Users can view their own unread senders"
  ON public.user_unread_senders
  FOR SELECT
  USING (user_id = auth.uid());

-- Service role has full access (for triggers and internal operations)
DROP POLICY IF EXISTS "Service role manages unread senders" ON public.user_unread_senders;
CREATE POLICY "Service role manages unread senders"
  ON public.user_unread_senders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Grant select to authenticated (RLS will filter appropriately)
GRANT SELECT ON public.user_unread_senders TO authenticated;

COMMENT ON TABLE public.user_unread_senders IS 'Per-sender unread message counters - RLS enabled, users see only their own data';

-- ============================================================================
-- Fix 2: archived_messages - Enable RLS
-- ============================================================================
-- Contains historical message content moved from the hot messages table.
-- Users should only see archived messages from their own conversations.

ALTER TABLE public.archived_messages ENABLE ROW LEVEL SECURITY;

-- Users can view archived messages from conversations they participated in
DROP POLICY IF EXISTS "Users can view their archived messages" ON public.archived_messages;
CREATE POLICY "Users can view their archived messages"
  ON public.archived_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = archived_messages.conversation_id
        AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
    )
  );

-- Service role has full access (for archival functions)
DROP POLICY IF EXISTS "Service role manages archived messages" ON public.archived_messages;
CREATE POLICY "Service role manages archived messages"
  ON public.archived_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Revoke direct access, only allow via RLS policies
REVOKE ALL ON public.archived_messages FROM authenticated;
GRANT SELECT ON public.archived_messages TO authenticated;

COMMENT ON TABLE public.archived_messages IS 'Historical message archive - RLS enabled, users see only their conversation messages';

-- ============================================================================
-- Fix 3: storage_cleanup_queue - Enable RLS (internal table)
-- ============================================================================
-- Internal table tracking orphaned storage objects for cleanup.
-- Should only be accessible by service_role for cleanup jobs.

ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;

-- Only service_role can access this internal table
DROP POLICY IF EXISTS "Service role only for cleanup queue" ON public.storage_cleanup_queue;
CREATE POLICY "Service role only for cleanup queue"
  ON public.storage_cleanup_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Explicitly revoke from authenticated users
REVOKE ALL ON public.storage_cleanup_queue FROM authenticated;
REVOKE ALL ON public.storage_cleanup_queue FROM anon;

COMMENT ON TABLE public.storage_cleanup_queue IS 'Internal cleanup queue - service_role only, not accessible via REST API';

-- ============================================================================
-- Fix 4: country_text_aliases - Enable RLS (public read-only reference)
-- ============================================================================
-- Lookup table mapping country name variations to IDs.
-- This is public reference data - anyone authenticated can read.

ALTER TABLE public.country_text_aliases ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read country aliases (public reference data)
DROP POLICY IF EXISTS "Anyone can read country aliases" ON public.country_text_aliases;
CREATE POLICY "Anyone can read country aliases"
  ON public.country_text_aliases
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can manage aliases (for admin operations)
DROP POLICY IF EXISTS "Service role manages country aliases" ON public.country_text_aliases;
CREATE POLICY "Service role manages country aliases"
  ON public.country_text_aliases
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Read access for authenticated users
GRANT SELECT ON public.country_text_aliases TO authenticated;

COMMENT ON TABLE public.country_text_aliases IS 'Country name variations lookup - RLS enabled, public read access';

COMMIT;
