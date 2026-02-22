-- ============================================================================
-- Career History → World Club Linking
-- Connects career_history entries to the World club directory so that
-- playing level (league tier, country, club reputation) can be inferred
-- from the graph rather than self-declared.
-- ============================================================================
-- OPERATIONS:
-- 1. Add world_club_id FK to career_history
-- 2. Add current_world_club_id FK to profiles
-- 3. Create search_world_clubs() RPC for autocomplete
-- 4. Create create_world_club_from_career() RPC for user-contributed clubs
-- ============================================================================

BEGIN;

SET search_path = public;

-- ============================================================================
-- STEP 1: Add world_club_id to career_history
-- Links a career entry to a specific club in the World directory.
-- Only relevant for entry_type = 'club'. NULL means unlinked (free text).
-- ============================================================================
ALTER TABLE public.career_history
  ADD COLUMN IF NOT EXISTS world_club_id UUID
  CONSTRAINT career_history_world_club_id_fkey
  REFERENCES public.world_clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_career_history_world_club
  ON public.career_history(world_club_id) WHERE world_club_id IS NOT NULL;

COMMENT ON COLUMN public.career_history.world_club_id IS
  'FK to world_clubs directory. Only set for entry_type=club. NULL means unlinked (free text).';

-- ============================================================================
-- STEP 2: Add current_world_club_id to profiles
-- Links a player/coach profile to their current club in the World directory.
-- profiles.current_club (TEXT) is kept for display; this FK adds structure.
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_world_club_id UUID
  CONSTRAINT profiles_current_world_club_id_fkey
  REFERENCES public.world_clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_current_world_club
  ON public.profiles(current_world_club_id) WHERE current_world_club_id IS NOT NULL;

COMMENT ON COLUMN public.profiles.current_world_club_id IS
  'FK to world_clubs directory for current club. current_club TEXT kept for display. NULL means unlinked.';

-- ============================================================================
-- STEP 3: search_world_clubs() — autocomplete RPC
-- Returns clubs matching a query with country + league info joined.
-- Prefix matches rank before substring matches.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.search_world_clubs(
  p_query TEXT,
  p_limit INT DEFAULT 15
)
RETURNS TABLE (
  id UUID,
  club_name TEXT,
  club_name_normalized TEXT,
  avatar_url TEXT,
  country_id INT,
  country_name TEXT,
  country_code TEXT,
  flag_emoji TEXT,
  province_id INT,
  province_name TEXT,
  men_league_name TEXT,
  women_league_name TEXT,
  men_league_tier INT,
  women_league_tier INT,
  is_claimed BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := lower(trim(p_query));

  -- Require at least 2 characters
  IF length(v_normalized) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    wc.id,
    wc.club_name,
    wc.club_name_normalized,
    wc.avatar_url,
    wc.country_id,
    c.name AS country_name,
    c.code AS country_code,
    c.flag_emoji,
    wc.province_id,
    wp.name AS province_name,
    ml.name AS men_league_name,
    wl.name AS women_league_name,
    ml.tier AS men_league_tier,
    wl.tier AS women_league_tier,
    wc.is_claimed
  FROM world_clubs wc
  JOIN countries c ON c.id = wc.country_id
  LEFT JOIN world_provinces wp ON wp.id = wc.province_id
  LEFT JOIN world_leagues ml ON ml.id = wc.men_league_id
  LEFT JOIN world_leagues wl ON wl.id = wc.women_league_id
  WHERE wc.club_name_normalized LIKE v_normalized || '%'
     OR wc.club_name_normalized LIKE '%' || v_normalized || '%'
  ORDER BY
    -- Prefix matches come first
    CASE WHEN wc.club_name_normalized LIKE v_normalized || '%' THEN 0 ELSE 1 END,
    wc.club_name ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.search_world_clubs IS
  'Autocomplete search for world clubs. Prefix matches rank first. Returns club with country/league info joined.';

GRANT EXECUTE ON FUNCTION public.search_world_clubs(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_world_clubs(TEXT, INT) TO anon;

-- ============================================================================
-- STEP 4: create_world_club_from_career() — user-contributed clubs
-- Players use this to add clubs to the directory WITHOUT claiming.
-- Idempotent: returns existing club on duplicate rather than erroring.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_world_club_from_career(
  p_club_name TEXT,
  p_country_id INT,
  p_province_id INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
  v_club_id TEXT;
  v_new_id UUID;
  v_existing RECORD;
  v_country_code TEXT;
BEGIN
  -- Normalize the club name
  v_normalized := lower(trim(p_club_name));

  IF length(v_normalized) < 2 THEN
    RAISE EXCEPTION 'Club name must be at least 2 characters';
  END IF;

  -- Check for existing club with same name in same country+province
  SELECT wc.id, wc.club_name, wc.avatar_url, wc.country_id, wc.province_id
    INTO v_existing
    FROM world_clubs wc
   WHERE wc.club_name_normalized = v_normalized
     AND wc.country_id = p_country_id
     AND COALESCE(wc.province_id, 0) = COALESCE(p_province_id, 0);

  IF v_existing IS NOT NULL THEN
    -- Return existing club (idempotent behavior)
    RETURN json_build_object(
      'success', true,
      'club_id', v_existing.id,
      'club_name', v_existing.club_name,
      'avatar_url', v_existing.avatar_url,
      'already_exists', true
    );
  END IF;

  -- Get country code for stable club_id generation
  SELECT code INTO v_country_code FROM countries WHERE countries.id = p_country_id;
  IF v_country_code IS NULL THEN
    RAISE EXCEPTION 'Invalid country_id: %', p_country_id;
  END IF;

  -- Generate stable club_id
  v_club_id := replace(v_normalized, ' ', '_') || '_' || lower(v_country_code) || '_' || extract(epoch from now())::bigint;

  -- Create club WITHOUT claiming
  INSERT INTO world_clubs (
    club_id, club_name, club_name_normalized, country_id, province_id,
    is_claimed, created_from
  ) VALUES (
    v_club_id, trim(p_club_name), v_normalized, p_country_id, p_province_id,
    false, 'user'
  )
  RETURNING world_clubs.id INTO v_new_id;

  RETURN json_build_object(
    'success', true,
    'club_id', v_new_id,
    'club_name', trim(p_club_name),
    'avatar_url', NULL,
    'already_exists', false
  );
END;
$$;

COMMENT ON FUNCTION public.create_world_club_from_career IS
  'Creates a world_club entry without claiming it. Used by players/coaches adding clubs from career history. Returns existing club on duplicate.';

GRANT EXECUTE ON FUNCTION public.create_world_club_from_career(TEXT, INT, INT) TO authenticated;

COMMIT;
