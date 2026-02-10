-- ============================================================================
-- Migration: Production Hardening — FK Indexes & Advisory Locks
-- Date: 2026-02-10
-- Purpose: Add missing FK indexes for query performance and advisory locks
--          for race-condition-safe rate limiting on post comments.
-- ============================================================================

-- ============================================================================
-- 1. MISSING FK INDEXES
-- ============================================================================
-- post_comments.author_id is used in the rate-limit trigger (COUNT WHERE author_id = ?)
-- and in JOINs for displaying comment authors.  Without an index, every INSERT
-- triggers a sequential scan on the growing post_comments table.

CREATE INDEX IF NOT EXISTS idx_post_comments_author
  ON public.post_comments (author_id);

-- profile_notifications.actor_profile_id is joined to profiles when rendering
-- notification feeds ("X liked your post", "X commented on your profile").

CREATE INDEX IF NOT EXISTS idx_profile_notifications_actor
  ON public.profile_notifications (actor_profile_id);

-- ============================================================================
-- 2. ADVISORY LOCK ON POST COMMENT RATE LIMIT
-- ============================================================================
-- The existing enforce_post_comment_rate_limit() trigger counts recent comments
-- but has no serialisation guard.  Two concurrent INSERTs can both pass the
-- COUNT check before either commits, allowing the limit to be exceeded.
--
-- Fix: acquire a transaction-scoped advisory lock keyed on the author before
-- counting.  This matches the pattern already used by
-- enforce_profile_comment_rate_limit() (see 202512141000_security_hardening.sql).

CREATE OR REPLACE FUNCTION public.enforce_post_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count INTEGER;
BEGIN
  -- Serialise per-author to prevent concurrent bypass
  PERFORM pg_advisory_xact_lock(hashtext('post_comment_rate:' || NEW.author_id::TEXT));

  SELECT COUNT(*) INTO v_recent_count
  FROM post_comments
  WHERE author_id = NEW.author_id
    AND created_at > (now() - interval '24 hours');

  IF v_recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 20 comments per 24 hours';
  END IF;

  RETURN NEW;
END;
$$;
