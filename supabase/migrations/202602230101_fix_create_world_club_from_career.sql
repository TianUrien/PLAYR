-- ============================================================================
-- Fix: create_world_club_from_career uses 'user' not 'user_career'
-- The CHECK constraint on world_clubs.created_from only allows: seed, user, admin
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
