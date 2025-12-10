/**
 * useAdminStats Hook
 * 
 * Fetches and caches dashboard statistics for the admin portal.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DashboardStats, SignupTrend, TopCountry } from '../types'
import { getDashboardStats, getSignupTrends, getTopCountries } from '../api/adminApi'

interface UseAdminStatsResult {
  stats: DashboardStats | null
  signupTrends: SignupTrend[]
  topCountries: TopCountry[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useAdminStats(): UseAdminStatsResult {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [signupTrends, setSignupTrends] = useState<SignupTrend[]>([])
  const [topCountries, setTopCountries] = useState<TopCountry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAllStats = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [statsData, trendsData, countriesData] = await Promise.all([
        getDashboardStats(),
        getSignupTrends(30),
        getTopCountries(10),
      ])

      setStats(statsData)
      setSignupTrends(trendsData)
      setTopCountries(countriesData)
    } catch (err) {
      console.error('[useAdminStats] Failed to fetch stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllStats()
  }, [fetchAllStats])

  return {
    stats,
    signupTrends,
    topCountries,
    isLoading,
    error,
    refetch: fetchAllStats,
  }
}
