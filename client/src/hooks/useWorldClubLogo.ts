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

  const promise = supabase
    .from('world_clubs')
    .select('avatar_url')
    .eq('id', worldClubId)
    .single()
    .then(({ data, error }) => {
      if (error) {
        logger.error('[useWorldClubLogo] Failed to fetch:', error)
        return null
      }
      const url = data?.avatar_url ?? null
      logoCache.set(worldClubId, url)
      return url
    })
    .finally(() => {
      pendingFetches.delete(worldClubId)
    })

  pendingFetches.set(worldClubId, promise)
  return promise
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
