-- ============================================================================
-- HOME FEED BACKFILL
-- ============================================================================
-- Populates initial feed items from existing data so the feed isn't empty.
-- Only backfills:
--   - All completed member profiles → member_joined items
--   - Open opportunities → opportunity_posted items
--   - Accepted references → reference_received items
-- All use ON CONFLICT DO NOTHING for safe re-runs.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. BACKFILL: Member Joined (all completed profiles)
-- ============================================================================

INSERT INTO home_feed_items (item_type, source_id, source_type, metadata, created_at)
SELECT
  'member_joined',
  p.id,
  'profile',
  jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'role', p.role,
    'avatar_url', p.avatar_url,
    'nationality_country_id', p.nationality_country_id,
    'base_location', p.base_location,
    'position', p.position,
    'current_club', p.current_club
  ),
  p.created_at
FROM profiles p
WHERE p.onboarding_completed = true
  AND (p.is_test_account IS NULL OR p.is_test_account = false)
  AND p.role IN ('player', 'coach', 'club')
ON CONFLICT (item_type, source_id) DO NOTHING;

-- ============================================================================
-- 2. BACKFILL: Opportunity Posted (all open opportunities)
-- ============================================================================

INSERT INTO home_feed_items (item_type, source_id, source_type, metadata, created_at)
SELECT
  'opportunity_posted',
  o.id,
  'vacancy',
  jsonb_build_object(
    'vacancy_id', o.id,
    'title', o.title,
    'opportunity_type', o.opportunity_type,
    'position', o.position,
    'gender', o.gender,
    'location_city', o.location_city,
    'location_country', o.location_country,
    'club_id', o.club_id,
    'club_name', p.full_name,
    'club_logo', p.avatar_url,
    'priority', o.priority,
    'start_date', o.start_date
  ),
  COALESCE(o.published_at, o.created_at)
FROM opportunities o
JOIN profiles p ON p.id = o.club_id
WHERE o.status = 'open'
  AND (p.is_test_account IS NULL OR p.is_test_account = false)
ON CONFLICT (item_type, source_id) DO NOTHING;

-- ============================================================================
-- 3. BACKFILL: References Received (all accepted references)
-- ============================================================================

INSERT INTO home_feed_items (item_type, source_id, source_type, metadata, created_at)
SELECT
  'reference_received',
  pr.id,
  'profile_reference',
  jsonb_build_object(
    'reference_record_id', pr.id,
    'profile_id', pr.requester_id,
    'full_name', req.full_name,
    'avatar_url', req.avatar_url,
    'role', req.role,
    'referee_id', pr.reference_id,
    'referee_name', ref.full_name,
    'referee_avatar', ref.avatar_url,
    'referee_role', ref.role,
    'relationship_type', pr.relationship_type,
    'endorsement_text', pr.endorsement_text
  ),
  COALESCE(pr.accepted_at, pr.created_at)
FROM profile_references pr
JOIN profiles req ON req.id = pr.requester_id
JOIN profiles ref ON ref.id = pr.reference_id
WHERE pr.status = 'accepted'
  AND (req.is_test_account IS NULL OR req.is_test_account = false)
ON CONFLICT (item_type, source_id) DO NOTHING;
