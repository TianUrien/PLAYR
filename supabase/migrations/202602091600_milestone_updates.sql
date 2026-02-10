-- ============================================================================
-- MILESTONE UPDATES: 60% / 80% / 100% PROFILE COMPLETION
-- ============================================================================
-- Updates the profile_milestones CHECK constraint to allow new milestone types,
-- and replaces the check_profile_completion_milestone() trigger function with
-- a scoring-based approach that fires at 60%, 80%, and 100% thresholds.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. UPDATE MILESTONE TYPE CONSTRAINT
-- ============================================================================

ALTER TABLE public.profile_milestones
  DROP CONSTRAINT IF EXISTS profile_milestones_milestone_type_check;

ALTER TABLE public.profile_milestones
  ADD CONSTRAINT profile_milestones_milestone_type_check
  CHECK (milestone_type IN (
    'first_video',
    'first_gallery_image',
    'profile_60_percent',
    'profile_80_percent',
    'profile_100_percent',
    'first_reference_received'
  ));

-- ============================================================================
-- 2. REPLACE PROFILE COMPLETION TRIGGER FUNCTION
-- ============================================================================
-- Scoring system per role (profiles columns only, no cross-table queries):
--
-- Player (max 100):
--   full_name=15, avatar_url=20, nationality_country_id=15,
--   position=10, bio=15, highlight_video_url=25
--
-- Coach (max 100):
--   full_name=15, avatar_url=20, nationality_country_id=15,
--   gender=10, date_of_birth=10, bio=15, base_location=15
--
-- Club (max 100):
--   full_name=20, avatar_url=25, club_bio=20,
--   base_location=20, year_founded=15
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_profile_completion_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score INTEGER := 0;
  v_metadata JSONB;
BEGIN
  -- Skip test accounts
  IF NEW.is_test_account = true THEN
    RETURN NEW;
  END IF;

  -- Only check when onboarding is completed
  IF NEW.onboarding_completed != true THEN
    RETURN NEW;
  END IF;

  -- Calculate score based on role
  IF NEW.role = 'player' THEN
    IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN v_score := v_score + 15; END IF;
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN v_score := v_score + 20; END IF;
    IF NEW.nationality_country_id IS NOT NULL THEN v_score := v_score + 15; END IF;
    IF NEW.position IS NOT NULL AND NEW.position != '' THEN v_score := v_score + 10; END IF;
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN v_score := v_score + 15; END IF;
    IF NEW.highlight_video_url IS NOT NULL AND NEW.highlight_video_url != '' THEN v_score := v_score + 25; END IF;

  ELSIF NEW.role = 'coach' THEN
    IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN v_score := v_score + 15; END IF;
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN v_score := v_score + 20; END IF;
    IF NEW.nationality_country_id IS NOT NULL THEN v_score := v_score + 15; END IF;
    IF NEW.gender IS NOT NULL AND NEW.gender != '' THEN v_score := v_score + 10; END IF;
    IF NEW.date_of_birth IS NOT NULL AND NEW.date_of_birth != '' THEN v_score := v_score + 10; END IF;
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN v_score := v_score + 15; END IF;
    IF NEW.base_location IS NOT NULL AND NEW.base_location != '' THEN v_score := v_score + 15; END IF;

  ELSIF NEW.role = 'club' THEN
    IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN v_score := v_score + 20; END IF;
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN v_score := v_score + 25; END IF;
    IF NEW.club_bio IS NOT NULL AND NEW.club_bio != '' THEN v_score := v_score + 20; END IF;
    IF NEW.base_location IS NOT NULL AND NEW.base_location != '' THEN v_score := v_score + 20; END IF;
    IF NEW.year_founded IS NOT NULL THEN v_score := v_score + 15; END IF;

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
    PERFORM record_milestone(NEW.id, 'profile_60_percent', v_metadata);
  END IF;

  IF v_score >= 80 THEN
    PERFORM record_milestone(NEW.id, 'profile_80_percent', v_metadata);
  END IF;

  IF v_score >= 100 THEN
    PERFORM record_milestone(NEW.id, 'profile_100_percent', v_metadata);
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from previous migration, just replacing the function
