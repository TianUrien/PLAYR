import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'
import type { CommandCenterStats, RetentionCohort, ActivationFunnelData, UserGrowthPoint } from '../types'
import { getCommandCenterStats, getRetentionCohorts, getActivationFunnel, getUserGrowthChart } from '../api/adminApi'

interface UseCommandCenterResult {
  stats: CommandCenterStats | null
  growthData: UserGrowthPoint[]
  cohorts: RetentionCohort[]
  funnel: ActivationFunnelData | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useCommandCenter(days: number): UseCommandCenterResult {
  const [stats, setStats] = useState<CommandCenterStats | null>(null)
  const [growthData, setGrowthData] = useState<UserGrowthPoint[]>([])
  const [cohorts, setCohorts] = useState<RetentionCohort[]>([])
  const [funnel, setFunnel] = useState<ActivationFunnelData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [statsData, growthChartData, cohortsData, funnelData] = await Promise.all([
        getCommandCenterStats(days),
        getUserGrowthChart(days),
        getRetentionCohorts(3),
        getActivationFunnel(days),
      ])

      setStats(statsData)
      setGrowthData(growthChartData)
      setCohorts(cohortsData)
      setFunnel(funnelData)
    } catch (err) {
      logger.error('[useCommandCenter] Failed to fetch:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch command center data')
    } finally {
      setIsLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { stats, growthData, cohorts, funnel, isLoading, error, refetch: fetchAll }
}
