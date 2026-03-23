-- Add coach_specialization column to profiles table.
-- Allows coaches to specify their professional specialization (e.g. Head Coach, S&C, etc.)

-- 1. Add the column (nullable for backward compat with existing coaches)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_specialization TEXT DEFAULT NULL;

-- 2. Add free-text column for "other" specializations
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_specialization_custom TEXT DEFAULT NULL;

-- 3. Valid values constraint (idempotent)
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT chk_coach_specialization_values
    CHECK (
      coach_specialization IS NULL
      OR coach_specialization IN (
        'head_coach',
        'assistant_coach',
        'goalkeeper_coach',
        'youth_coach',
        'strength_conditioning',
        'performance_analyst',
        'sports_scientist',
        'other'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Only coaches (or NULLs) can have a specialization (idempotent)
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT chk_coach_specialization_role
    CHECK (
      coach_specialization IS NULL
      OR role = 'coach'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. If specialization is 'other', custom must be provided (idempotent)
DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT chk_coach_specialization_custom_required
    CHECK (
      coach_specialization IS DISTINCT FROM 'other'
      OR (coach_specialization_custom IS NOT NULL AND coach_specialization_custom != '')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Add new coach position values to opportunity_position enum
-- (goalkeeper_coach, strength_conditioning, performance_analyst, sports_scientist, other)
DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'goalkeeper_coach';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'strength_conditioning';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'performance_analyst';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'sports_scientist';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'other_coach';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Update the existing search vector function to include coach_specialization
--    The function is called update_profiles_search_vector (created in 202602130100).
--    We replace it to add weighted fields and coach specialization support.
CREATE OR REPLACE FUNCTION public.update_profiles_search_vector()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.full_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.position, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.secondary_position, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.base_location, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.nationality, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.current_club, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.bio, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.club_bio, '')), 'D') ||
    setweight(to_tsvector('english',
      COALESCE(REPLACE(COALESCE(NEW.coach_specialization, ''), '_', ' '), '')
    ), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.coach_specialization_custom, '')), 'B');
  RETURN NEW;
END;
$$;

-- 7b. Recreate the trigger to also fire on coach_specialization changes
DROP TRIGGER IF EXISTS trg_profiles_search_vector ON public.profiles;
CREATE TRIGGER trg_profiles_search_vector
  BEFORE INSERT OR UPDATE OF full_name, bio, club_bio, position, secondary_position,
    current_club, base_location, nationality, coach_specialization, coach_specialization_custom
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_profiles_search_vector();

-- 8. Update coach scoring in check_profile_completion_milestone to include specialization.
--    We re-create the entire function to keep player/club sections intact.
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
    -- Basic info (15): full_name + nationality + location + dob + gender
    IF NEW.full_name IS NOT NULL AND NEW.full_name != ''
       AND NEW.nationality_country_id IS NOT NULL
       AND NEW.base_location IS NOT NULL AND NEW.base_location != ''
       AND NEW.date_of_birth IS NOT NULL
       AND NEW.gender IS NOT NULL AND NEW.gender != '' THEN
      v_score := v_score + 15;
    END IF;

    -- Specialization (10): coach_specialization selected
    IF NEW.coach_specialization IS NOT NULL AND NEW.coach_specialization != '' THEN
      v_score := v_score + 10;
    END IF;

    -- Profile photo (15)
    IF NEW.avatar_url IS NOT NULL AND NEW.avatar_url != '' THEN
      v_score := v_score + 15;
    END IF;

    -- Professional bio (15)
    IF NEW.bio IS NOT NULL AND NEW.bio != '' THEN
      v_score := v_score + 15;
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

-- 9. Update discover_profiles to support coach_specialization filtering and include it in results
CREATE OR REPLACE FUNCTION public.discover_profiles(
  p_roles                  TEXT[]   DEFAULT NULL,
  p_positions              TEXT[]   DEFAULT NULL,
  p_gender                 TEXT     DEFAULT NULL,
  p_min_age                INT      DEFAULT NULL,
  p_max_age                INT      DEFAULT NULL,
  p_nationality_country_ids INT[]   DEFAULT NULL,
  p_eu_passport            BOOLEAN  DEFAULT NULL,
  p_base_country_ids       INT[]   DEFAULT NULL,
  p_base_location          TEXT     DEFAULT NULL,
  p_availability           TEXT     DEFAULT NULL,
  p_min_references         INT      DEFAULT NULL,
  p_min_career_entries     INT      DEFAULT NULL,
  p_league_ids             INT[]   DEFAULT NULL,
  p_country_ids            INT[]   DEFAULT NULL,
  p_search_text            TEXT     DEFAULT NULL,
  p_sort_by                TEXT     DEFAULT 'relevance',
  p_limit                  INT      DEFAULT 20,
  p_offset                 INT      DEFAULT 0,
  p_coach_specializations  TEXT[]   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eu_country_ids INT[];
  v_total BIGINT;
  v_results JSONB;
BEGIN
  -- Resolve EU country IDs if eu_passport filter is active
  IF p_eu_passport = true THEN
    SELECT ARRAY_AGG(id) INTO v_eu_country_ids
    FROM countries
    WHERE code IN (
      'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR',
      'DE','GR','HU','IE','IT','LV','LT','LU','MT','NL',
      'PL','PT','RO','SK','SI','ES','SE'
    );
  END IF;

  -- Count total matching profiles
  SELECT COUNT(*) INTO v_total
  FROM profiles p
  LEFT JOIN world_clubs wc ON wc.id = p.current_world_club_id
  WHERE p.onboarding_completed = true
    AND p.is_test_account = false
    AND p.is_blocked = false
    AND (p_roles IS NULL OR p.role = ANY(p_roles))
    AND (p_positions IS NULL OR p.position = ANY(p_positions) OR p.secondary_position = ANY(p_positions))
    AND (p_gender IS NULL OR p.gender = p_gender)
    AND (p_min_age IS NULL OR p.date_of_birth IS NOT NULL
         AND p.date_of_birth <= CURRENT_DATE - (p_min_age * INTERVAL '1 year'))
    AND (p_max_age IS NULL OR p.date_of_birth IS NOT NULL
         AND p.date_of_birth >= CURRENT_DATE - ((p_max_age + 1) * INTERVAL '1 year'))
    AND (p_nationality_country_ids IS NULL
         OR p.nationality_country_id = ANY(p_nationality_country_ids)
         OR p.nationality2_country_id = ANY(p_nationality_country_ids))
    AND (p_eu_passport IS NULL OR p_eu_passport = false
         OR p.nationality_country_id = ANY(v_eu_country_ids)
         OR p.nationality2_country_id = ANY(v_eu_country_ids))
    AND (p_base_country_ids IS NULL OR p.base_country_id = ANY(p_base_country_ids))
    AND (p_base_location IS NULL
         OR p.base_city ILIKE '%' || p_base_location || '%'
         OR p.base_location ILIKE '%' || p_base_location || '%')
    AND (p_availability IS NULL
         OR (p_availability = 'open_to_play' AND p.open_to_play = true)
         OR (p_availability = 'open_to_coach' AND p.open_to_coach = true)
         OR (p_availability = 'open_to_opportunities' AND p.open_to_opportunities = true))
    AND (p_min_references IS NULL OR p.accepted_reference_count >= p_min_references)
    AND (p_min_career_entries IS NULL OR p.career_entry_count >= p_min_career_entries)
    AND (p_league_ids IS NULL
         OR p.mens_league_id = ANY(p_league_ids)
         OR p.womens_league_id = ANY(p_league_ids))
    AND (p_country_ids IS NULL OR wc.country_id = ANY(p_country_ids))
    AND (p_coach_specializations IS NULL OR p.coach_specialization = ANY(p_coach_specializations))
    AND (p_search_text IS NULL
         OR p.search_vector @@ plainto_tsquery('english', p_search_text));

  -- Fetch results with enrichment
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_results
  FROM (
    SELECT jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'username', p.username,
      'avatar_url', p.avatar_url,
      'role', p.role,
      'position', p.position,
      'secondary_position', p.secondary_position,
      'gender', p.gender,
      'age', CASE
        WHEN p.date_of_birth IS NOT NULL
        THEN EXTRACT(YEAR FROM age(CURRENT_DATE, p.date_of_birth))::INT
        ELSE NULL
      END,
      'nationality_country_id', p.nationality_country_id,
      'nationality2_country_id', p.nationality2_country_id,
      'nationality_name', cn1.nationality_name,
      'nationality2_name', cn2.nationality_name,
      'flag_emoji', cn1.flag_emoji,
      'flag_emoji2', cn2.flag_emoji,
      'base_location', COALESCE(p.base_city, p.base_location),
      'base_country_name', cnb.name,
      'current_club', p.current_club,
      'current_world_club_id', p.current_world_club_id,
      'open_to_play', p.open_to_play,
      'open_to_coach', p.open_to_coach,
      'open_to_opportunities', p.open_to_opportunities,
      'accepted_reference_count', p.accepted_reference_count,
      'career_entry_count', p.career_entry_count,
      'accepted_friend_count', p.accepted_friend_count,
      'last_active_at', p.last_active_at,
      'coach_specialization', p.coach_specialization,
      'coach_specialization_custom', p.coach_specialization_custom
    ) AS row_data
    FROM profiles p
    LEFT JOIN countries cn1 ON cn1.id = p.nationality_country_id
    LEFT JOIN countries cn2 ON cn2.id = p.nationality2_country_id
    LEFT JOIN countries cnb ON cnb.id = p.base_country_id
    LEFT JOIN world_clubs wc ON wc.id = p.current_world_club_id
    WHERE p.onboarding_completed = true
      AND p.is_test_account = false
      AND p.is_blocked = false
      AND (p_roles IS NULL OR p.role = ANY(p_roles))
      AND (p_positions IS NULL OR p.position = ANY(p_positions) OR p.secondary_position = ANY(p_positions))
      AND (p_gender IS NULL OR p.gender = p_gender)
      AND (p_min_age IS NULL OR p.date_of_birth IS NOT NULL
           AND p.date_of_birth <= CURRENT_DATE - (p_min_age * INTERVAL '1 year'))
      AND (p_max_age IS NULL OR p.date_of_birth IS NOT NULL
           AND p.date_of_birth >= CURRENT_DATE - ((p_max_age + 1) * INTERVAL '1 year'))
      AND (p_nationality_country_ids IS NULL
           OR p.nationality_country_id = ANY(p_nationality_country_ids)
           OR p.nationality2_country_id = ANY(p_nationality_country_ids))
      AND (p_eu_passport IS NULL OR p_eu_passport = false
           OR p.nationality_country_id = ANY(v_eu_country_ids)
           OR p.nationality2_country_id = ANY(v_eu_country_ids))
      AND (p_base_country_ids IS NULL OR p.base_country_id = ANY(p_base_country_ids))
      AND (p_base_location IS NULL
           OR p.base_city ILIKE '%' || p_base_location || '%'
           OR p.base_location ILIKE '%' || p_base_location || '%')
      AND (p_availability IS NULL
           OR (p_availability = 'open_to_play' AND p.open_to_play = true)
           OR (p_availability = 'open_to_coach' AND p.open_to_coach = true)
           OR (p_availability = 'open_to_opportunities' AND p.open_to_opportunities = true))
      AND (p_min_references IS NULL OR p.accepted_reference_count >= p_min_references)
      AND (p_min_career_entries IS NULL OR p.career_entry_count >= p_min_career_entries)
      AND (p_league_ids IS NULL
           OR p.mens_league_id = ANY(p_league_ids)
           OR p.womens_league_id = ANY(p_league_ids))
      AND (p_country_ids IS NULL OR wc.country_id = ANY(p_country_ids))
      AND (p_coach_specializations IS NULL OR p.coach_specialization = ANY(p_coach_specializations))
      AND (p_search_text IS NULL
           OR p.search_vector @@ plainto_tsquery('english', p_search_text))
    ORDER BY
      CASE p_sort_by
        WHEN 'newest' THEN NULL
        WHEN 'most_referenced' THEN NULL
        WHEN 'recently_active' THEN NULL
        ELSE NULL
      END,
      CASE WHEN p_sort_by = 'most_referenced'
        THEN p.accepted_reference_count END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'recently_active'
        THEN p.last_active_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'relevance' AND p_search_text IS NOT NULL
        THEN ts_rank(p.search_vector, plainto_tsquery('english', p_search_text)) END DESC NULLS LAST,
      p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'results', v_results,
    'total', v_total,
    'has_more', (p_offset + p_limit) < v_total
  );
END;
$$;
