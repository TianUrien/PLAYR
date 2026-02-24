-- ============================================================================
-- Migration: Add denormalized aggregate columns to profiles
-- ============================================================================
-- Problem: reference_count, career_entry_count, friend_count, post_count are
-- computed via N+1 subqueries at runtime. Profile strength hooks alone fire 4
-- separate COUNT queries per mount. AI search would require correlated subqueries
-- across potentially thousands of profiles.
--
-- Solution: Add pre-computed count columns maintained by atomic triggers.
-- Follows the existing user_posts.like_count / comment_count pattern
-- (see 202602101000_phase1_perf_fixes.sql for the atomic increment approach).
-- ============================================================================

-- ============================================================================
-- 1. ADD COLUMNS
-- ============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accepted_reference_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS career_entry_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accepted_friend_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_count               INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.accepted_reference_count IS 'Denormalized count of accepted references (requester side). Maintained by trigger.';
COMMENT ON COLUMN profiles.career_entry_count IS 'Denormalized count of career_history entries. Maintained by trigger.';
COMMENT ON COLUMN profiles.accepted_friend_count IS 'Denormalized count of accepted friendships. Maintained by trigger.';
COMMENT ON COLUMN profiles.post_count IS 'Denormalized count of non-deleted user_posts. Maintained by trigger.';

-- ============================================================================
-- 2. BACKFILL EXISTING DATA
-- ============================================================================

-- 2a. Accepted reference count (references the user REQUESTED, i.e., references ON their profile)
UPDATE profiles p
SET accepted_reference_count = COALESCE((
  SELECT COUNT(*)
  FROM profile_references pr
  WHERE pr.requester_id = p.id
    AND pr.status = 'accepted'
), 0);

-- 2b. Career entry count
UPDATE profiles p
SET career_entry_count = COALESCE((
  SELECT COUNT(*)
  FROM career_history ch
  WHERE ch.user_id = p.id
), 0);

-- 2c. Accepted friend count
UPDATE profiles p
SET accepted_friend_count = COALESCE((
  SELECT COUNT(*)
  FROM profile_friendships pf
  WHERE (pf.user_one = p.id OR pf.user_two = p.id)
    AND pf.status = 'accepted'
), 0);

-- 2d. Post count (non-deleted)
UPDATE profiles p
SET post_count = COALESCE((
  SELECT COUNT(*)
  FROM user_posts up
  WHERE up.author_id = p.id
    AND up.deleted_at IS NULL
), 0);

-- ============================================================================
-- 3. TRIGGER FUNCTIONS (atomic increment/decrement)
-- ============================================================================

-- 3a. Reference count trigger
-- Fires on profile_references INSERT/UPDATE/DELETE
-- Tracks status changes: pending→accepted = +1, accepted→declined = -1
CREATE OR REPLACE FUNCTION public.update_profile_reference_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' THEN
      UPDATE profiles SET accepted_reference_count = accepted_reference_count + 1
      WHERE id = NEW.requester_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed TO accepted
    IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET accepted_reference_count = accepted_reference_count + 1
      WHERE id = NEW.requester_id;
    -- Status changed FROM accepted
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
      UPDATE profiles SET accepted_reference_count = GREATEST(0, accepted_reference_count - 1)
      WHERE id = NEW.requester_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      UPDATE profiles SET accepted_reference_count = GREATEST(0, accepted_reference_count - 1)
      WHERE id = OLD.requester_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_profile_reference_count
  AFTER INSERT OR UPDATE OR DELETE ON profile_references
  FOR EACH ROW EXECUTE FUNCTION update_profile_reference_count();

-- 3b. Career entry count trigger
-- Fires on career_history INSERT/DELETE
CREATE OR REPLACE FUNCTION public.update_profile_career_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE profiles SET career_entry_count = GREATEST(0, career_entry_count - 1)
    WHERE id = OLD.user_id;
    RETURN OLD;
  ELSE
    UPDATE profiles SET career_entry_count = career_entry_count + 1
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_profile_career_count
  AFTER INSERT OR DELETE ON career_history
  FOR EACH ROW EXECUTE FUNCTION update_profile_career_count();

-- 3c. Friend count trigger
-- Fires on profile_friendships INSERT/UPDATE/DELETE
-- Must update BOTH user_one and user_two
CREATE OR REPLACE FUNCTION public.update_profile_friend_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'accepted' THEN
      UPDATE profiles SET accepted_friend_count = accepted_friend_count + 1
      WHERE id IN (NEW.user_one, NEW.user_two);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Status changed TO accepted
    IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
      UPDATE profiles SET accepted_friend_count = accepted_friend_count + 1
      WHERE id IN (NEW.user_one, NEW.user_two);
    -- Status changed FROM accepted
    ELSIF OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
      UPDATE profiles SET accepted_friend_count = GREATEST(0, accepted_friend_count - 1)
      WHERE id IN (OLD.user_one, OLD.user_two);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'accepted' THEN
      UPDATE profiles SET accepted_friend_count = GREATEST(0, accepted_friend_count - 1)
      WHERE id IN (OLD.user_one, OLD.user_two);
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_profile_friend_count
  AFTER INSERT OR UPDATE OR DELETE ON profile_friendships
  FOR EACH ROW EXECUTE FUNCTION update_profile_friend_count();

-- 3d. Post count trigger
-- Fires on user_posts INSERT/UPDATE(deleted_at)/DELETE
CREATE OR REPLACE FUNCTION public.update_profile_post_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE profiles SET post_count = post_count + 1
      WHERE id = NEW.author_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft-deleted (deleted_at went from NULL to non-NULL)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE profiles SET post_count = GREATEST(0, post_count - 1)
      WHERE id = NEW.author_id;
    -- Un-deleted (deleted_at went from non-NULL to NULL)
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE profiles SET post_count = post_count + 1
      WHERE id = NEW.author_id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE profiles SET post_count = GREATEST(0, post_count - 1)
      WHERE id = OLD.author_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_profile_post_count
  AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON user_posts
  FOR EACH ROW EXECUTE FUNCTION update_profile_post_count();
