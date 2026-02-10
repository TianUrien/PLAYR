-- ============================================================================
-- PHASE 1 PERFORMANCE FIXES
-- ============================================================================
-- 1. Replace subquery-based like/comment count triggers with atomic operations
-- 2. Add partial indexes for soft-deleted feed queries
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. ATOMIC LIKE COUNT TRIGGER (replaces subquery-based COUNT)
-- ============================================================================
-- Previous version: SET like_count = (SELECT COUNT(*) FROM post_likes WHERE ...)
-- Problem: Concurrent likes can both read the same count, losing increments.
-- Fix: Use atomic increment/decrement based on trigger operation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_post_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
    UPDATE user_posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = v_post_id;
    RETURN OLD;
  ELSE
    v_post_id := NEW.post_id;
    UPDATE user_posts
    SET like_count = like_count + 1
    WHERE id = v_post_id;
    RETURN NEW;
  END IF;
END;
$$;

-- ============================================================================
-- 2. ATOMIC COMMENT COUNT TRIGGER (replaces subquery-based COUNT)
-- ============================================================================
-- Previous version: SET comment_count = (SELECT COUNT(*) FROM post_comments WHERE ...)
-- Same race condition fix as above.
-- For soft-delete updates, we check whether deleted_at changed to/from NULL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);

  IF TG_OP = 'INSERT' THEN
    UPDATE user_posts
    SET comment_count = comment_count + 1
    WHERE id = v_post_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft-delete toggle: deleted_at changed
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      -- Comment was soft-deleted → decrement
      UPDATE user_posts
      SET comment_count = GREATEST(0, comment_count - 1)
      WHERE id = v_post_id;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      -- Comment was restored → increment
      UPDATE user_posts
      SET comment_count = comment_count + 1
      WHERE id = v_post_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. PARTIAL INDEXES FOR FEED PERFORMANCE
-- ============================================================================
-- These indexes cover the common feed query pattern:
--   WHERE deleted_at IS NULL ORDER BY created_at DESC
-- A partial index excludes soft-deleted rows, making the index smaller and
-- faster for the >99% of queries that only want active items.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_home_feed_items_active_created
  ON public.home_feed_items (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_posts_active_created
  ON public.user_posts (created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for the has_liked EXISTS subquery in get_home_feed
CREATE INDEX IF NOT EXISTS idx_post_likes_post_user
  ON public.post_likes (post_id, user_id);

-- Index for comment count queries filtered by soft-delete
CREATE INDEX IF NOT EXISTS idx_post_comments_post_active
  ON public.post_comments (post_id)
  WHERE deleted_at IS NULL;
