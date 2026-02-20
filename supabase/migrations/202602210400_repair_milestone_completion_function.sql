-- ============================================================================
-- REPAIR Migration: Re-apply milestone completion function + constraint
-- Date: 2026-02-21
-- Description:
--   Migration 202602180400 re-introduced a regression in
--   check_profile_completion_milestone() — it fires profile_60_percent and
--   profile_80_percent milestones. Migration 202602200100 was supposed to fix
--   this (100%-only), but may not have executed on the remote database
--   (same pattern as 202602130300_repair_rich_media_feed.sql).
--
--   The live state is:
--     Function: tries to INSERT 'profile_60_percent' (from 202602180400)
--     Constraint: does NOT allow 'profile_60_percent' (from 202602170500)
--     → CHECK constraint violation when club score >= 60
--
--   This repair migration re-applies:
--     1. Correct CHECK constraint (3 valid types)
--     2. Correct check_profile_completion_milestone() — only 100%
--     3. Reactive reverse logic (score drops below 100 → remove milestone)
--     4. handle_video_delete_milestone + trigger (no-op for this bug, but
--        restoring completeness from 202602200100)
--     5. Content deletion recheck triggers
--     6. Cleanup: delete any stale 60/80% milestones and feed items
--
--   All statements use CREATE OR REPLACE / DROP IF EXISTS for idempotency.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. CLEANUP stale 60/80% data (in case any slipped through)
-- ============================================================================

UPDATE home_feed_items
SET deleted_at = now()
WHERE item_type = 'milestone_achieved'
  AND deleted_at IS NULL
  AND metadata->>'milestone_type' IN ('profile_60_percent', 'profile_80_percent');

DELETE FROM profile_milestones
WHERE milestone_type IN ('profile_60_percent', 'profile_80_percent');

-- ============================================================================
-- 2. CORRECT CHECK CONSTRAINT
-- ============================================================================

ALTER TABLE profile_milestones
  DROP CONSTRAINT IF EXISTS profile_milestones_milestone_type_check;

ALTER TABLE profile_milestones
  ADD CONSTRAINT profile_milestones_milestone_type_check
  CHECK (milestone_type IN (
    'first_gallery_image',
    'profile_100_percent',
    'first_reference_received'
  ));

-- ============================================================================
-- 3. CORRECT check_profile_completion_milestone() — 100% only + reactive
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_profile_completion_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER := 0;
  v_has_gallery BOOLEAN := false;
  v_has_journey BOOLEAN := false;
  v_has_friends BOOLEAN := false;
  v_has_references BOOLEAN := false;
  v_metadata JSONB;
  v_feed_item_id UUID;
BEGIN
  -- Skip test accounts
  IF NEW.is_test_account = true THEN RETURN NEW; END IF;

  -- Only check when onboarding is completed
  IF NEW.onboarding_completed != true THEN RETURN NEW; END IF;

  -- ── Player ────────────────────────────────────────────────────────────
  IF NEW.role = 'player' THEN
    -- Basic info (15): nationality + location + position
    IF NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.position IS NOT NULL AND NEW.position != '' THEN
      v_score := v_score + 15;
    END IF;

    -- Profile photo (15)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 15;
    END IF;

    -- Highlight video (20)
    IF NEW.highlight_video_url IS NOT NULL AND NEW.highlight_video_url != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Journey (15): at least 1 career_history entry
    SELECT EXISTS(SELECT 1 FROM career_history WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_journey;
    IF v_has_journey THEN v_score := v_score + 15; END IF;

    -- Gallery (10): at least 1 gallery_photos entry
    SELECT EXISTS(SELECT 1 FROM gallery_photos WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_gallery;
    IF v_has_gallery THEN v_score := v_score + 10; END IF;

    -- Friends (10): at least 1 accepted friendship
    SELECT EXISTS(
      SELECT 1 FROM profile_friendships
      WHERE (user_one = NEW.id OR user_two = NEW.id)
        AND status = 'accepted'
      LIMIT 1
    ) INTO v_has_friends;
    IF v_has_friends THEN v_score := v_score + 10; END IF;

    -- References (15): at least 1 accepted reference (player is the requester)
    SELECT EXISTS(
      SELECT 1 FROM profile_references
      WHERE requester_id = NEW.id
        AND status = 'accepted'
      LIMIT 1
    ) INTO v_has_references;
    IF v_has_references THEN v_score := v_score + 15; END IF;

  -- ── Coach ─────────────────────────────────────────────────────────────
  ELSIF NEW.role = 'coach' THEN
    -- Basic info (20): full_name + nationality + location + dob + gender
    IF NEW.full_name IS NOT NULL AND NEW.full_name != ''
       AND NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.date_of_birth IS NOT NULL
       AND NEW.gender IS NOT NULL AND NEW.gender != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Profile photo (15)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 15;
    END IF;

    -- Professional bio (20)
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Journey (20): at least 1 career_history entry
    SELECT EXISTS(SELECT 1 FROM career_history WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_journey;
    IF v_has_journey THEN v_score := v_score + 20; END IF;

    -- Gallery (10): at least 1 gallery_photos entry
    SELECT EXISTS(SELECT 1 FROM gallery_photos WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_gallery;
    IF v_has_gallery THEN v_score := v_score + 10; END IF;

    -- References (15): at least 1 accepted reference (coach is the requester)
    SELECT EXISTS(
      SELECT 1 FROM profile_references
      WHERE requester_id = NEW.id
        AND status = 'accepted'
      LIMIT 1
    ) INTO v_has_references;
    IF v_has_references THEN v_score := v_score + 15; END IF;

  -- ── Club ──────────────────────────────────────────────────────────────
  ELSIF NEW.role = 'club' THEN
    -- Basic info (35): nationality + location + year_founded + (website OR contact_email)
    IF NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.year_founded IS NOT NULL
       AND (
         (NEW.website IS NOT NULL AND NEW.website != '')
         OR (NEW.contact_email IS NOT NULL AND NEW.contact_email != '')
       ) THEN
      v_score := v_score + 35;
    END IF;

    -- Club logo (25)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 25;
    END IF;

    -- Club bio (20)
    IF NEW.club_bio IS NOT NULL AND NEW.club_bio != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Gallery (20): at least 1 club_media entry
    SELECT EXISTS(SELECT 1 FROM club_media WHERE club_id = NEW.id LIMIT 1)
      INTO v_has_gallery;
    IF v_has_gallery THEN v_score := v_score + 20; END IF;

  ELSE
    -- Brand or unknown role — skip
    RETURN NEW;
  END IF;

  IF v_score >= 100 THEN
    -- Score is 100% — create milestone if it doesn't exist (idempotent)
    v_metadata := jsonb_build_object(
      'profile_id', NEW.id,
      'full_name', NEW.full_name,
      'avatar_url', NEW.avatar_url,
      'role', NEW.role
    );

    PERFORM record_milestone(NEW.id, 'profile_100_percent', COALESCE(NEW.is_test_account, false), v_metadata);
  ELSE
    -- Score dropped below 100% — remove milestone if it exists (reactive)
    SELECT hfi.id INTO v_feed_item_id
    FROM home_feed_items hfi
    WHERE hfi.item_type = 'milestone_achieved'
      AND hfi.metadata->>'milestone_type' = 'profile_100_percent'
      AND hfi.metadata->>'profile_id' = NEW.id::TEXT
      AND hfi.deleted_at IS NULL;

    IF v_feed_item_id IS NOT NULL THEN
      UPDATE home_feed_items
      SET deleted_at = now()
      WHERE id = v_feed_item_id;

      DELETE FROM profile_milestones
      WHERE profile_id = NEW.id
        AND milestone_type = 'profile_100_percent';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. RESTORE handle_video_delete_milestone (from 202602200100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_video_delete_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_feed_item_id UUID;
BEGIN
  -- Only act when highlight_video_url transitions from a value to NULL/empty
  IF (OLD.highlight_video_url IS NOT NULL AND OLD.highlight_video_url != '')
     AND (NEW.highlight_video_url IS NULL OR NEW.highlight_video_url = '') THEN

    SELECT hfi.id INTO v_feed_item_id
    FROM home_feed_items hfi
    WHERE hfi.item_type = 'milestone_achieved'
      AND hfi.metadata->>'milestone_type' = 'first_video'
      AND hfi.metadata->>'profile_id' = NEW.id::TEXT
      AND hfi.deleted_at IS NULL;

    IF v_feed_item_id IS NULL THEN
      RETURN NEW;
    END IF;

    UPDATE home_feed_items
    SET deleted_at = now()
    WHERE id = v_feed_item_id;

    DELETE FROM profile_milestones
    WHERE profile_id = NEW.id
      AND milestone_type = 'first_video';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_video_delete_milestone ON profiles;
CREATE TRIGGER trg_video_delete_milestone
  AFTER UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_video_delete_milestone();

-- ============================================================================
-- 5. RESTORE content deletion recheck triggers (from 202602200100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE profiles SET updated_at = now() WHERE id = OLD.user_id;
    RETURN OLD;
  ELSE
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_club_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE profiles SET updated_at = now() WHERE id = OLD.club_id;
    RETURN OLD;
  ELSE
    UPDATE profiles SET updated_at = now() WHERE id = NEW.club_id;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS recheck_completion_on_career_history_delete ON career_history;
CREATE TRIGGER recheck_completion_on_career_history_delete
  AFTER DELETE ON career_history
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_content();

DROP TRIGGER IF EXISTS recheck_completion_on_gallery_photo_delete ON gallery_photos;
CREATE TRIGGER recheck_completion_on_gallery_photo_delete
  AFTER DELETE ON gallery_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_content();

DROP TRIGGER IF EXISTS recheck_completion_on_club_media_delete ON club_media;
CREATE TRIGGER recheck_completion_on_club_media_delete
  AFTER DELETE ON club_media
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_club_content();

-- ============================================================================
-- 6. RESTORE friendship/reference recheck triggers (from 202602200100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_friendship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_one;
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_two;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_one;
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_two;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.requester_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.requester_id;
  END IF;
  RETURN NEW;
END;
$$;
