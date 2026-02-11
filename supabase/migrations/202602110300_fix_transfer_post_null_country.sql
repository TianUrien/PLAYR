-- ============================================================================
-- Migration: Fix create_transfer_post NULL country handling
-- Date: 2026-02-11
-- Description: When p_club_country_id is NULL (unknown club, no country),
--   the v_country RECORD was never assigned, causing PostgreSQL error 55000
--   "record v_country is not assigned yet" when building metadata JSONB.
--   Fix: replace RECORD with separate TEXT variables that default to NULL.
-- ============================================================================

SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_transfer_post(
  p_club_name TEXT,
  p_club_country_id INT DEFAULT NULL,
  p_world_club_id UUID DEFAULT NULL,
  p_club_avatar_url TEXT DEFAULT NULL,
  p_content TEXT DEFAULT NULL,
  p_images JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_post_id UUID;
  v_trimmed TEXT;
  v_metadata JSONB;
  v_rate_check JSONB;
  v_is_test BOOLEAN;
  v_country_code TEXT := NULL;
  v_country_name TEXT := NULL;
  v_club_avatar TEXT;
  v_club_profile_id UUID;
  v_is_known_club BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Rate limit check (same pool as regular posts)
  SELECT COALESCE(is_test_account, false) INTO v_is_test
  FROM profiles WHERE id = v_user_id;

  IF NOT v_is_test THEN
    v_rate_check := public.check_rate_limit(v_user_id::TEXT, 'create_post', 10, 3600);
    IF NOT (v_rate_check ->> 'allowed')::BOOLEAN THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Rate limit exceeded: maximum 10 posts per hour'
      );
    END IF;
  END IF;

  -- Validate club name
  IF trim(COALESCE(p_club_name, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Club name is required');
  END IF;

  -- Resolve country info (only if country_id provided)
  IF p_club_country_id IS NOT NULL THEN
    SELECT code, name INTO v_country_code, v_country_name
    FROM countries WHERE id = p_club_country_id;
  END IF;

  -- Start with user-provided avatar (for unknown clubs with uploaded logo)
  v_club_avatar := p_club_avatar_url;

  -- Resolve club avatar and profile from world_clubs if provided
  IF p_world_club_id IS NOT NULL THEN
    SELECT wc.claimed_profile_id INTO v_club_profile_id
    FROM world_clubs wc WHERE wc.id = p_world_club_id;

    IF v_club_profile_id IS NOT NULL THEN
      SELECT avatar_url INTO v_club_avatar
      FROM profiles WHERE id = v_club_profile_id;
    END IF;
    v_is_known_club := true;
  END IF;

  -- Build metadata
  v_metadata := jsonb_build_object(
    'club_name', trim(p_club_name),
    'club_country_id', p_club_country_id,
    'club_country_code', v_country_code,
    'club_country_name', v_country_name,
    'club_avatar_url', v_club_avatar,
    'world_club_id', p_world_club_id,
    'club_profile_id', v_club_profile_id,
    'is_known_club', v_is_known_club
  );

  -- Use provided content or generate default
  v_trimmed := trim(COALESCE(p_content, ''));
  IF v_trimmed = '' THEN
    v_trimmed := 'Joined ' || trim(p_club_name) || '!';
  END IF;

  IF char_length(v_trimmed) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Content exceeds 2000 character limit');
  END IF;

  -- Validate images
  IF p_images IS NOT NULL AND jsonb_array_length(p_images) > 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum 4 images allowed');
  END IF;

  -- Insert the transfer post
  INSERT INTO user_posts (author_id, content, images, post_type, metadata)
  VALUES (v_user_id, v_trimmed, p_images, 'transfer', v_metadata)
  RETURNING id INTO v_post_id;

  -- Auto-update the player's current_club on their profile
  UPDATE profiles
  SET current_club = trim(p_club_name)
  WHERE id = v_user_id;

  RETURN jsonb_build_object('success', true, 'post_id', v_post_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_transfer_post(TEXT, INT, UUID, TEXT, TEXT, JSONB) TO authenticated;
COMMENT ON FUNCTION public.create_transfer_post IS 'Creates a transfer announcement post with structured club metadata. Auto-updates profile current_club.';
