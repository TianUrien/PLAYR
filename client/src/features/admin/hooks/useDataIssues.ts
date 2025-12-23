/**
 * useDataIssues Hook
 * 
 * Fetches data integrity issues for the admin portal.
 */

import { useState, useCallback } from 'react'
import { logger } from '@/lib/logger'
import type { AuthOrphan, ProfileOrphan, BrokenReferences } from '../types'
import { getAuthOrphans, getProfileOrphans, getBrokenReferences } from '../api/adminApi'

interface UseDataIssuesResult {
  authOrphans: AuthOrphan[]
  profileOrphans: ProfileOrphan[]
  brokenReferences: BrokenReferences | null
  isLoading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  fetchAuthOrphans: () => Promise<void>
  fetchProfileOrphans: () => Promise<void>
  fetchBrokenReferences: () => Promise<void>
}

export function useDataIssues(): UseDataIssuesResult {
  const [authOrphans, setAuthOrphans] = useState<AuthOrphan[]>([])
  const [profileOrphans, setProfileOrphans] = useState<ProfileOrphan[]>([])
  const [brokenReferences, setBrokenReferences] = useState<BrokenReferences | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAuthOrphans = useCallback(async () => {
    try {
      const data = await getAuthOrphans()
      setAuthOrphans(data)
    } catch (err) {
      logger.error('[useDataIssues] Failed to fetch auth orphans:', err)
      throw err
    }
  }, [])

  const fetchProfileOrphans = useCallback(async () => {
    try {
      const data = await getProfileOrphans()
      setProfileOrphans(data)
    } catch (err) {
      logger.error('[useDataIssues] Failed to fetch profile orphans:', err)
      throw err
    }
  }, [])

  const fetchBrokenReferences = useCallback(async () => {
    try {
      const data = await getBrokenReferences()
      setBrokenReferences(data)
    } catch (err) {
      logger.error('[useDataIssues] Failed to fetch broken references:', err)
      throw err
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      await Promise.all([
        fetchAuthOrphans(),
        fetchProfileOrphans(),
        fetchBrokenReferences(),
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data issues')
    } finally {
      setIsLoading(false)
    }
  }, [fetchAuthOrphans, fetchProfileOrphans, fetchBrokenReferences])

  return {
    authOrphans,
    profileOrphans,
    brokenReferences,
    isLoading,
    error,
    fetchAll,
    fetchAuthOrphans,
    fetchProfileOrphans,
    fetchBrokenReferences,
  }
}
