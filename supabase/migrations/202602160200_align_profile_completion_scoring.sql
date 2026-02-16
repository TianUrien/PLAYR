-- ============================================================================
-- Align DB profile completion scoring with frontend hooks
-- ============================================================================
-- Problem: The DB trigger scored profiles using only `profiles` table columns,
-- while the frontend hooks also check cross-table data (gallery_photos,
-- club_media, career_history). This caused false "profile completed" feed
-- posts for users who hadn't uploaded gallery photos or journey entries.
--
-- Fix: Rewrite check_profile_completion_milestone() to match each role's
-- frontend hook exactly, including cross-table EXISTS checks.
-- Also add triggers on gallery/journey inserts to re-evaluate completion
-- immediately (instead of waiting for the next profile edit).
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. REPLACE check_profile_completion_milestone() — aligned scoring
-- ============================================================================
-- Frontend hooks and their weights:
--
-- Player (useProfileStrength):
--   basic_info(nationality+location+position)=25, avatar=20,
--   highlight_video=25, journey(career_history>=1)=15, gallery(gallery_photos>=1)=15
--
-- Coach (useCoachProfileStrength):
--   basic_info(full_name+nationality+location+dob+gender)=25, avatar=20,
--   bio=20, journey(career_history>=1)=20, gallery(gallery_photos>=1)=15
--
-- Club (useClubProfileStrength):
--   basic_info(nationality+location+year_founded+website|contact_email)=35,
--   avatar=25, club_bio=20, gallery(club_media>=1)=20

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
  v_metadata JSONB;
BEGIN
  -- Skip test accounts
  IF NEW.is_test_account = true THEN RETURN NEW; END IF;

  -- Only check when onboarding is completed
  IF NEW.onboarding_completed != true THEN RETURN NEW; END IF;

  -- ── Player ────────────────────────────────────────────────────────────
  IF NEW.role = 'player' THEN
    -- Basic info (25): nationality + location + position
    IF NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.position IS NOT NULL AND NEW.position != '' THEN
      v_score := v_score + 25;
    END IF;

    -- Profile photo (20)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 20;
    END IF;

    -- Highlight video (25)
    IF NEW.highlight_video_url IS NOT NULL AND NEW.highlight_video_url != '' THEN
      v_score := v_score + 25;
    END IF;

    -- Journey (15): at least 1 career_history entry
    SELECT EXISTS(SELECT 1 FROM career_history WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_journey;
    IF v_has_journey THEN v_score := v_score + 15; END IF;

    -- Gallery (15): at least 1 gallery_photos entry
    SELECT EXISTS(SELECT 1 FROM gallery_photos WHERE user_id = NEW.id LIMIT 1)
      INTO v_has_gallery;
    IF v_has_gallery THEN v_score := v_score + 15; END IF;

  -- ── Coach ─────────────────────────────────────────────────────────────
  ELSIF NEW.role = 'coach' THEN
    -- Basic info (25): full_name + nationality + location + dob + gender
    IF NEW.full_name IS NOT NULL AND NEW.full_name != ''
       AND NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth != ''
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

  -- Build metadata for feed items
  v_metadata := jsonb_build_object(
    'profile_id', NEW.id,
    'full_name', NEW.full_name,
    'avatar_url', NEW.avatar_url,
    'role', NEW.role
  );

  -- Fire milestones at each threshold (record_milestone is idempotent)
  IF v_score >= 60 THEN
    PERFORM record_milestone(NEW.id, 'profile_60_percent', COALESCE(NEW.is_test_account, false), v_metadata);
  END IF;

  IF v_score >= 80 THEN
    PERFORM record_milestone(NEW.id, 'profile_80_percent', COALESCE(NEW.is_test_account, false), v_metadata);
  END IF;

  IF v_score >= 100 THEN
    PERFORM record_milestone(NEW.id, 'profile_100_percent', COALESCE(NEW.is_test_account, false), v_metadata);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. RE-EVALUATE COMPLETION on gallery / journey inserts
-- ============================================================================
-- When a gallery photo, club media, or career history entry is added, touch
-- the profile's updated_at to re-fire check_profile_completion_milestone().
-- This ensures the 100% milestone fires immediately rather than waiting for
-- the next manual profile edit.
--
-- The touch only runs once (for the first row), since record_milestone is
-- idempotent and will skip if the milestone already exists.

-- 2a. gallery_photos / career_history → profiles.updated_at (player/coach)
CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET updated_at = now() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- 2b. club_media → profiles.updated_at (club)
CREATE OR REPLACE FUNCTION public.recheck_profile_completion_on_club_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles SET updated_at = now() WHERE id = NEW.club_id;
  RETURN NEW;
END;
$$;

-- Gallery photos (player/coach)
DROP TRIGGER IF EXISTS recheck_completion_on_gallery_photo ON public.gallery_photos;
CREATE TRIGGER recheck_completion_on_gallery_photo
  AFTER INSERT ON public.gallery_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_content();

-- Career history (player/coach)
DROP TRIGGER IF EXISTS recheck_completion_on_career_history ON public.career_history;
CREATE TRIGGER recheck_completion_on_career_history
  AFTER INSERT ON public.career_history
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_content();

-- Club media (club)
DROP TRIGGER IF EXISTS recheck_completion_on_club_media ON public.club_media;
CREATE TRIGGER recheck_completion_on_club_media
  AFTER INSERT ON public.club_media
  FOR EACH ROW
  EXECUTE FUNCTION public.recheck_profile_completion_on_club_content();
