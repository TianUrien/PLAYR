-- Migration: Security Hardening
-- Date: 2024-12-14
-- Description: P0/P1 security fixes from platform audit
--   - P0: Avatar storage upload policy path ownership
--   - P1: Rate limit race condition fixes with advisory locks
--   - P1: Cascade references revocation on friendship deletion

SET search_path = public;

-- ============================================================================
-- P0: FIX AVATAR STORAGE UPLOAD POLICY
-- Users should only be able to upload to their own folder (userId/filename)
-- ============================================================================

DROP POLICY IF EXISTS "Users upload avatars" ON storage.objects;
CREATE POLICY "Users upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

-- ============================================================================
-- P1: FIX RACE CONDITION IN PROFILE COMMENT RATE LIMIT
-- Use advisory lock to prevent concurrent inserts bypassing the limit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_profile_comment_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 5;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  IF NEW.author_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Use advisory lock to prevent race conditions
  PERFORM pg_advisory_xact_lock(hashtext('comment_rate:' || NEW.author_profile_id::TEXT));

  SELECT COUNT(*)
  INTO recent_total
  FROM public.profile_comments
  WHERE author_profile_id = NEW.author_profile_id
    AND created_at >= window_start
    AND status <> 'deleted';

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'comment_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s comments per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.enforce_profile_comment_rate_limit IS 
  'Prevents users from posting more than 5 comments in a rolling 24h period. Uses advisory lock to prevent race conditions.';

-- ============================================================================
-- P1: FIX RACE CONDITION IN PROFILE REFERENCES MAX LIMIT
-- Use advisory lock to prevent concurrent requests bypassing the max limit
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_profile_reference_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepted_count INTEGER;
  max_references CONSTANT INTEGER := 5;
BEGIN
  IF NEW.requester_id = NEW.reference_id THEN
    RAISE EXCEPTION 'You cannot add yourself as a reference.';
  END IF;

  NEW.relationship_type := LEFT(btrim(COALESCE(NEW.relationship_type, '')), 120);
  IF NEW.relationship_type = '' THEN
    RAISE EXCEPTION 'Relationship type is required.';
  END IF;

  IF NEW.request_note IS NOT NULL THEN
    NEW.request_note := NULLIF(LEFT(btrim(NEW.request_note), 1200), '');
  END IF;

  IF NEW.endorsement_text IS NOT NULL THEN
    NEW.endorsement_text := NULLIF(LEFT(btrim(NEW.endorsement_text), 1200), '');
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := COALESCE(NEW.status, 'pending');
    NEW.created_at := COALESCE(NEW.created_at, timezone('utc', now()));
    RETURN NEW;
  END IF;

  IF NEW.requester_id <> OLD.requester_id OR NEW.reference_id <> OLD.reference_id THEN
    RAISE EXCEPTION 'Reference participants cannot change.';
  END IF;

  IF NEW.status = 'pending' AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'References cannot revert to pending after a decision.';
  END IF;

  IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
    -- Use advisory lock to prevent race conditions when checking max limit
    PERFORM pg_advisory_xact_lock(hashtext('reference_max:' || NEW.requester_id::TEXT));
    
    SELECT COUNT(*)
      INTO accepted_count
      FROM public.profile_references
     WHERE requester_id = NEW.requester_id
       AND status = 'accepted'
       AND id <> NEW.id;

    IF accepted_count >= max_references THEN
      RAISE EXCEPTION 'You already have % trusted references.', max_references;
    END IF;

    NEW.accepted_at := timezone('utc', now());
    NEW.responded_at := NEW.accepted_at;
  ELSIF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    NEW.accepted_at := NULL;
  END IF;

  IF NEW.status = 'declined' AND OLD.status <> 'declined' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending requests can be declined.';
    END IF;
    NEW.responded_at := timezone('utc', now());
  END IF;

  IF NEW.status = 'revoked' AND OLD.status <> 'revoked' THEN
    NEW.revoked_at := timezone('utc', now());
    NEW.revoked_by := auth.uid();
  ELSIF NEW.status <> 'revoked' THEN
    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_profile_reference_state IS 
  'Manages profile reference lifecycle. Uses advisory lock for max references check to prevent race conditions.';

-- ============================================================================
-- P1: CASCADE REVOKE REFERENCES WHEN FRIENDSHIP IS DELETED/BLOCKED
-- Prevent orphaned references when the underlying friendship ends
-- ============================================================================

CREATE OR REPLACE FUNCTION public.revoke_references_on_friendship_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When friendship ends (deleted or status changed from accepted)
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.status <> 'accepted' AND OLD.status = 'accepted') THEN
    -- Revoke any pending or accepted references between these users
    UPDATE public.profile_references
    SET status = 'revoked',
        revoked_at = timezone('utc', now()),
        revoked_by = NULL  -- System revocation (no specific user)
    WHERE status IN ('pending', 'accepted')
      AND (
        (requester_id = OLD.user_one AND reference_id = OLD.user_two)
        OR (requester_id = OLD.user_two AND reference_id = OLD.user_one)
      );
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.revoke_references_on_friendship_end IS 
  'Automatically revokes trusted references when the underlying friendship is deleted or blocked.';

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS profile_friendships_cascade_references ON public.profile_friendships;
CREATE TRIGGER profile_friendships_cascade_references
AFTER DELETE OR UPDATE ON public.profile_friendships
FOR EACH ROW EXECUTE FUNCTION public.revoke_references_on_friendship_end();

-- ============================================================================
-- P1: ADD SET search_path TO is_platform_admin FUNCTION
-- Defense-in-depth against search path hijacking
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN,
    FALSE
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin IS 
  'Evaluates current JWT claims to determine admin/moderator privileges.';
