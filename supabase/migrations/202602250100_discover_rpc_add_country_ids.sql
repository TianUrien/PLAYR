-- Add nationality_country_id and nationality2_country_id to discover_profiles RPC output
-- so MemberCard can render dual nationality with flags and EU indicators.
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
  p_offset                 INT      DEFAULT 0
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
      'last_active_at', p.last_active_at
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
