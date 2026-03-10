import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/**
 * Module-level cache: world_club_id → avatar_url.
 * Persists across component mounts/unmounts within the same session,
 * eliminating race conditions from React StrictMode double-effects
 * and auth store re-renders.
 */
const logoCache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

async function fetchLogo(worldClubId: string): Promise<string | null> {
  // Return cached result
  if (logoCache.has(worldClubId)) {
    return logoCache.get(worldClubId)!
  }

  // De-duplicate in-flight requests
  if (pendingFetches.has(worldClubId)) {
    return pendingFetches.get(worldClubId)!
  }

  const promise = (async () => {
    try {
      const { data, error } = await supabase
        .from('world_clubs')
        .select('avatar_url, claimed_profile:profiles!world_clubs_claimed_profile_id_fkey(avatar_url)')
        .eq('id', worldClubId)
        .single()

      if (error) {
        logger.error('[useWorldClubLogo] Failed to fetch:', error)
        return null
      }
      // COALESCE: prefer world club logo, fall back to claimed profile avatar
      const claimedAvatar = (data?.claimed_profile as { avatar_url: string | null } | null)?.avatar_url
      const url = data?.avatar_url || claimedAvatar || null
      logoCache.set(worldClubId, url)
      return url
    } finally {
      pendingFetches.delete(worldClubId)
    }
  })()

  pendingFetches.set(worldClubId, promise)
  return promise
}

/**
 * Batch-prefetch logos for multiple world clubs in a single query.
 * Populates the module-level cache so subsequent useWorldClubLogo calls
 * return instantly without individual network requests (avoids N+1).
 */
export async function prefetchWorldClubLogos(worldClubIds: string[]): Promise<void> {
  // Filter to only IDs not already cached
  const uncachedIds = worldClubIds.filter(id => !logoCache.has(id))
  if (uncachedIds.length === 0) return

  try {
    const { data, error } = await supabase
      .from('world_clubs')
      .select('id, avatar_url, claimed_profile:profiles!world_clubs_claimed_profile_id_fkey(avatar_url)')
      .in('id', uncachedIds)

    if (error) {
      logger.error('[prefetchWorldClubLogos] Failed to batch fetch:', error)
      return
    }

    for (const club of data || []) {
      const claimedAvatar = (club.claimed_profile as { avatar_url: string | null } | null)?.avatar_url
      const url = club.avatar_url || claimedAvatar || null
      logoCache.set(club.id, url)
    }

    // Mark clubs with no row as null so we don't re-fetch them
    for (const id of uncachedIds) {
      if (!logoCache.has(id)) {
        logoCache.set(id, null)
      }
    }
  } catch (err) {
    logger.error('[prefetchWorldClubLogos] Unexpected error:', err)
  }
}

/**
 * Hook to fetch and cache a world club's avatar URL.
 * Uses a module-level cache to avoid refetching on re-renders.
 */
export function useWorldClubLogo(worldClubId: string | null): string | null {
  const [logo, setLogo] = useState<string | null>(() =>
    worldClubId ? logoCache.get(worldClubId) ?? null : null
  )

  const fetch = useCallback(async () => {
    if (!worldClubId) {
      setLogo(null)
      return
    }

    // Immediately return cached value if available
    const cached = logoCache.get(worldClubId)
    if (cached !== undefined) {
      setLogo(cached)
      return
    }

    const url = await fetchLogo(worldClubId)
    setLogo(url)
  }, [worldClubId])

  useEffect(() => {
    fetch()
  }, [fetch])

  return logo
}
