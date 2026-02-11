-- ============================================================================
-- Migration: Backfill System Feed Items for Test Accounts
-- Date: 2026-02-11
-- Description: The previous migration (0600) updated triggers to always create
--   feed items for test accounts. But existing accepted references (and other
--   system events) from test accounts were never inserted because the old
--   triggers skipped them. This backfills the missing items.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. BACKFILL: reference_received items for accepted references
-- ============================================================================

INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, created_at, metadata)
SELECT
  'reference_received',
  pr.id,
  'profile_reference',
  COALESCE(req.is_test_account, false),
  COALESCE(pr.accepted_at, pr.updated_at, pr.created_at),
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
  )
FROM profile_references pr
JOIN profiles req ON req.id = pr.requester_id
JOIN profiles ref ON ref.id = pr.reference_id
WHERE pr.status = 'accepted'
ON CONFLICT (item_type, source_id) DO NOTHING;

-- ============================================================================
-- 2. BACKFILL: member_joined items for test account profiles
-- ============================================================================

INSERT INTO home_feed_items (item_type, source_id, source_type, is_test_account, created_at, metadata)
SELECT
  'member_joined',
  p.id,
  'profile',
  true,
  p.created_at,
  jsonb_build_object(
    'profile_id', p.id,
    'full_name', p.full_name,
    'role', p.role,
    'avatar_url', p.avatar_url,
    'nationality_country_id', p.nationality_country_id,
    'base_location', p.base_location,
    'position', p.position,
    'current_club', p.current_club
  )
FROM profiles p
WHERE p.onboarding_completed = true
  AND p.is_test_account = true
  AND p.role IN ('player', 'coach', 'club')
ON CONFLICT (item_type, source_id) DO NOTHING;
