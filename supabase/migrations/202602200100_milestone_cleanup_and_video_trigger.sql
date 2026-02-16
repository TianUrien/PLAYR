-- ============================================================================
-- Milestone System Cleanup & Hardening
-- ============================================================================
-- Addresses three problems:
--   1. Legacy profile_60/80_percent feed items show vague "achieved a milestone"
--   2. first_gallery_image milestones with stale image_url (broken placeholder)
--   3. Milestones persist after underlying action is reverted (video, completion)
--
-- Sections:
--   A. Soft-delete legacy 60%/80% milestones + clean up profile_milestones
--   B. Tighten CHECK constraint (remove dead types)
--   C. Fix stale gallery image milestones (retroactive cleanup)
--   D. Video deletion cleanup trigger
--   E. Make profile_100_percent reactive (reverse logic + DELETE triggers)
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- A. SOFT-DELETE LEGACY 60%/80% MILESTONES
-- ============================================================================

-- Soft-delete feed items — get_home_feed() filters WHERE deleted_at IS NULL
UPDATE home_feed_items
SET deleted_at = now()
WHERE item_type = 'milestone_achieved'
  AND deleted_at IS NULL
  AND metadata->>'milestone_type' IN ('profile_60_percent', 'profile_80_percent');

-- Hard-delete from profile_milestones — these types will never re-trigger
DELETE FROM profile_milestones
WHERE milestone_type IN ('profile_60_percent', 'profile_80_percent');

-- ============================================================================
-- B. TIGHTEN CHECK CONSTRAINT
-- ============================================================================
-- Remove dead types so they can never be inserted again.

ALTER TABLE profile_milestones
  DROP CONSTRAINT IF EXISTS profile_milestones_milestone_type_check;

ALTER TABLE profile_milestones
  ADD CONSTRAINT profile_milestones_milestone_type_check
  CHECK (milestone_type IN (
    'first_video',
    'first_gallery_image',
    'profile_100_percent',
    'first_reference_received'
  ));

-- ============================================================================
-- C. FIX STALE GALLERY IMAGE MILESTONES
-- ============================================================================
-- Retroactive cleanup for milestones broken before the gallery delete trigger
-- (202602190402) was deployed.

-- C1: Stale image_url BUT user has other gallery photos → swap to latest
UPDATE home_feed_items hfi
SET metadata = jsonb_set(
  hfi.metadata,
  '{image_url}',
  to_jsonb((
    SELECT gp.photo_url
    FROM gallery_photos gp
    WHERE gp.user_id = (hfi.metadata->>'profile_id')::UUID
    ORDER BY gp.created_at DESC
    LIMIT 1
  ))
)
WHERE hfi.item_type = 'milestone_achieved'
  AND hfi.deleted_at IS NULL
  AND hfi.metadata->>'milestone_type' = 'first_gallery_image'
  AND hfi.metadata->>'image_url' IS NOT NULL
  -- image_url does not match any existing gallery photo
  AND NOT EXISTS (
    SELECT 1 FROM gallery_photos gp
    WHERE gp.user_id = (hfi.metadata->>'profile_id')::UUID
      AND gp.photo_url = hfi.metadata->>'image_url'
  )
  -- but user still has at least one photo
  AND EXISTS (
    SELECT 1 FROM gallery_photos gp
    WHERE gp.user_id = (hfi.metadata->>'profile_id')::UUID
  );

-- C2: Stale image_url AND user has NO photos → soft-delete
UPDATE home_feed_items hfi
SET deleted_at = now()
WHERE hfi.item_type = 'milestone_achieved'
  AND hfi.deleted_at IS NULL
  AND hfi.metadata->>'milestone_type' = 'first_gallery_image'
  AND hfi.metadata->>'image_url' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM gallery_photos gp
    WHERE gp.user_id = (hfi.metadata->>'profile_id')::UUID
      AND gp.photo_url = hfi.metadata->>'image_url'
  )
  AND NOT EXISTS (
    SELECT 1 FROM gallery_photos gp
    WHERE gp.user_id = (hfi.metadata->>'profile_id')::UUID
  );

-- C3: Remove profile_milestones for users with no photos and no active feed item
-- (enables re-trigger on next upload)
DELETE FROM profile_milestones pm
WHERE pm.milestone_type = 'first_gallery_image'
  AND NOT EXISTS (
    SELECT 1 FROM gallery_photos gp
    WHERE gp.user_id = pm.profile_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM home_feed_items hfi
    WHERE hfi.item_type = 'milestone_achieved'
      AND hfi.metadata->>'milestone_type' = 'first_gallery_image'
      AND hfi.metadata->>'profile_id' = pm.profile_id::TEXT
      AND hfi.deleted_at IS NULL
  );

-- ============================================================================
-- D. VIDEO DELETION CLEANUP TRIGGER
-- ============================================================================
-- When highlight_video_url transitions from a value to NULL/empty:
--   1. Soft-delete the first_video milestone feed item
--   2. Remove profile_milestones row (so it can re-trigger on next video add)
-- Mirrors handle_gallery_photo_delete_milestone() pattern.

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

    -- Find the active first_video milestone feed item for this profile
    SELECT hfi.id INTO v_feed_item_id
    FROM home_feed_items hfi
    WHERE hfi.item_type = 'milestone_achieved'
      AND hfi.metadata->>'milestone_type' = 'first_video'
      AND hfi.metadata->>'profile_id' = NEW.id::TEXT
      AND hfi.deleted_at IS NULL;

    IF v_feed_item_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Soft-delete the feed item
    UPDATE home_feed_items
    SET deleted_at = now()
    WHERE id = v_feed_item_id;

    -- Remove from profile_milestones so it can re-trigger on next video add
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
-- E. MAKE profile_100_percent REACTIVE
-- ============================================================================

-- E1: Extend check_profile_completion_milestone() with reverse logic
-- When score drops below 100: soft-delete feed item + remove profile_milestones

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
    -- Basic info (25): full_name + nationality + location + dob + gender
    IF NEW.full_name IS NOT NULL AND NEW.full_name != ''
       AND NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.date_of_birth IS NOT NULL
       AND NEW.gender IS NOT NULL AND NEW.gender != '' THEN
      v_score := v_score + 25;
    END IF;

    -- Profile photo (20)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Professional bio (20)
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Journey (20): at least 1 career_history entry
    SELECT EXISTS(SELECT 1 FROM career_history WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_journey;
    IF v_has_journey THEN v_score := v_score + 20; END IF;

    -- Gallery (15): at least 1 gallery_photos entry
    SELECT EXISTS(SELECT 1 FROM gallery_photos WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_gallery;
    IF v_has_gallery THEN v_score := v_score + 15; END IF;

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
    -- Score dropped below 100% — remove milestone if it exists
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

-- E2: Extend content trigger functions to handle DELETE (touch profiles.updated_at)
-- These functions already handle INSERT; adding TG_OP check for DELETE.

-- gallery_photos / career_history → profiles.updated_at
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

-- club_media → profiles.updated_at
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

-- New DELETE triggers (existing INSERT triggers remain unchanged)

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

-- E3: Extend friendship/reference triggers to also fire when status LEAVES 'accepted'

CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_friendship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Status becomes 'accepted' → touch both profiles (score may increase)
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_one;
    UPDATE profiles SET updated_at = now() WHERE id = NEW.user_two;
  -- Status leaves 'accepted' → touch both profiles (score may decrease)
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
  -- Status becomes 'accepted' → touch requester's profile (score may increase)
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.requester_id;
  -- Status leaves 'accepted' → touch requester's profile (score may decrease)
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'accepted' AND NEW.status != 'accepted' THEN
    UPDATE profiles SET updated_at = now() WHERE id = NEW.requester_id;
  END IF;
  RETURN NEW;
END;
$$;
