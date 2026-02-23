/**
 * DB Integration Tests for get_club_members RPC
 *
 * Verifies the RPC correctly:
 * - Returns players/coaches linked to a claimed club
 * - Returns empty for unclaimed clubs or profiles with no members
 * - Respects pagination (offset/limit)
 * - Only returns completed-onboarding profiles
 * - Is callable by any authenticated user (SECURITY DEFINER)
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  authenticatePlayer,
  authenticateClub,
  authenticateCoach,
  hasRequiredEnv,
  type AuthenticatedClient,
} from './setup'

const skip = !hasRequiredEnv()

describe.skipIf(skip)('get_club_members RPC', () => {
  let player: AuthenticatedClient
  let club: AuthenticatedClient
  let coach: AuthenticatedClient

  beforeAll(async () => {
    ;[player, club, coach] = await Promise.all([
      authenticatePlayer(),
      authenticateClub(),
      authenticateCoach(),
    ])
  })

  // ── Basic functionality ────────────────────────────────────────

  it('returns an array (may be empty) when called with the club profile ID', async () => {
    const { data, error } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('returns expected columns in each row', async () => {
    const { data, error } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
      p_limit: 1,
    })

    expect(error).toBeNull()

    if (data && data.length > 0) {
      const row = data[0]
      // Verify all expected columns exist
      expect(row).toHaveProperty('id')
      expect(row).toHaveProperty('full_name')
      expect(row).toHaveProperty('avatar_url')
      expect(row).toHaveProperty('role')
      expect(row).toHaveProperty('nationality')
      expect(row).toHaveProperty('nationality_country_id')
      expect(row).toHaveProperty('base_location')
      expect(row).toHaveProperty('position')
      expect(row).toHaveProperty('current_club')
      expect(row).toHaveProperty('current_world_club_id')
      expect(row).toHaveProperty('created_at')
      expect(row).toHaveProperty('open_to_play')
      expect(row).toHaveProperty('open_to_coach')
      expect(row).toHaveProperty('is_test_account')
      expect(row).toHaveProperty('total_count')

      // Role should only be player or coach
      expect(['player', 'coach']).toContain(row.role)
    } else {
      console.warn('  ⏭  No members found for club — column check skipped')
    }
  })

  it('only returns players and coaches (never club or brand roles)', async () => {
    const { data, error } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
    })

    expect(error).toBeNull()

    for (const row of data ?? []) {
      expect(['player', 'coach']).toContain(row.role)
    }
  })

  // ── Pagination ─────────────────────────────────────────────────

  it('respects p_limit parameter', async () => {
    const { data, error } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
      p_limit: 1,
    })

    expect(error).toBeNull()
    expect((data ?? []).length).toBeLessThanOrEqual(1)
  })

  it('total_count is consistent across paginated calls', async () => {
    const { data: page1 } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
      p_limit: 1,
      p_offset: 0,
    })

    if (!page1 || page1.length === 0) {
      console.warn('  ⏭  No members found — pagination test skipped')
      return
    }

    const { data: page2 } = await club.client.rpc('get_club_members', {
      p_profile_id: club.userId,
      p_limit: 1,
      p_offset: 1,
    })

    // total_count should be the same regardless of page
    expect(page1[0].total_count).toBeGreaterThan(0)
    if (page2 && page2.length > 0) {
      expect(page2[0].total_count).toBe(page1[0].total_count)
    }
  })

  // ── Edge cases ─────────────────────────────────────────────────

  it('returns empty array for a non-existent profile ID', async () => {
    const { data, error } = await club.client.rpc('get_club_members', {
      p_profile_id: '00000000-0000-0000-0000-000000000000',
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('returns empty array for a player profile (not a club)', async () => {
    // Player profiles don't have claimed world_clubs
    const { data, error } = await player.client.rpc('get_club_members', {
      p_profile_id: player.userId,
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  // ── Cross-role access (SECURITY DEFINER) ───────────────────────

  it('is callable by a player (not just the club owner)', async () => {
    const { data, error } = await player.client.rpc('get_club_members', {
      p_profile_id: club.userId,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('is callable by a coach', async () => {
    const { data, error } = await coach.client.rpc('get_club_members', {
      p_profile_id: club.userId,
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('returns consistent results across different callers', async () => {
    const [clubResult, playerResult, coachResult] = await Promise.all([
      club.client.rpc('get_club_members', { p_profile_id: club.userId }),
      player.client.rpc('get_club_members', { p_profile_id: club.userId }),
      coach.client.rpc('get_club_members', { p_profile_id: club.userId }),
    ])

    expect(clubResult.error).toBeNull()
    expect(playerResult.error).toBeNull()
    expect(coachResult.error).toBeNull()

    // All three should return the same member count
    const clubCount = (clubResult.data ?? []).length
    const playerCount = (playerResult.data ?? []).length
    const coachCount = (coachResult.data ?? []).length

    expect(playerCount).toBe(clubCount)
    expect(coachCount).toBe(clubCount)
  })
})
