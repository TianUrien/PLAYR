-- RPC: get_club_members
-- Given a club's profile_id, finds ALL linked world_clubs (a club can claim
-- multiple entries), then returns all players/coaches whose
-- current_world_club_id matches any of them. Deduplicates in case a member
-- somehow appears under multiple clubs.
CREATE OR REPLACE FUNCTION public.get_club_members(
  p_profile_id UUID,
  p_limit INT DEFAULT 30,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  nationality TEXT,
  nationality_country_id INT,
  nationality2_country_id INT,
  base_location TEXT,
  "position" TEXT,
  secondary_position TEXT,
  current_club TEXT,
  current_world_club_id UUID,
  created_at TIMESTAMPTZ,
  open_to_play BOOLEAN,
  open_to_coach BOOLEAN,
  is_test_account BOOLEAN,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH club_ids AS (
    SELECT wc.id AS world_club_id
    FROM world_clubs wc
    WHERE wc.claimed_profile_id = p_profile_id
  ),
  members AS (
    SELECT DISTINCT ON (p.id) p.*
    FROM profiles p
    JOIN club_ids c ON p.current_world_club_id = c.world_club_id
    WHERE p.role IN ('player', 'coach')
      AND p.onboarding_completed = true
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM members
  )
  SELECT
    m.id,
    m.full_name,
    m.avatar_url,
    m.role::TEXT,
    m.nationality,
    m.nationality_country_id,
    m.nationality2_country_id,
    m.base_location,
    m.position,
    m.secondary_position,
    m.current_club,
    m.current_world_club_id,
    m.created_at,
    m.open_to_play,
    m.open_to_coach,
    m.is_test_account,
    c.cnt AS total_count
  FROM members m
  CROSS JOIN counted c
  ORDER BY m.full_name ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;
