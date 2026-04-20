import { useCallback, useEffect, useState } from 'react'
import {
  fetchSearchAppearancesSummary,
  type SearchAppearancesSummary,
} from '@/lib/searchAppearances'

interface UseSearchAppearancesOptions {
  /** Profile id whose analytics to read. Null disables the fetch. */
  profileId: string | null | undefined
  /** Days of history to request (clamped server-side to 1..90). */
  days?: number
}

interface UseSearchAppearancesResult {
  summary: SearchAppearancesSummary | null
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * Owner-side hook for the search-appearance aggregate. Calls the SECURITY
 * DEFINER RPC which authorises `auth.uid() = profileId` server-side, so
 * passing anyone else's id yields an error and `null` summary.
 */
export function useSearchAppearances({
  profileId,
  days = 7,
}: UseSearchAppearancesOptions): UseSearchAppearancesResult {
  const [summary, setSummary] = useState<SearchAppearancesSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!profileId) {
      setSummary(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await fetchSearchAppearancesSummary(profileId, days)
    setSummary(result)
    setLoading(false)
  }, [profileId, days])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { summary, loading, refresh }
}
