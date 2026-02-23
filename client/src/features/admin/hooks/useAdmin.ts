/**
 * useAdmin Hook
 * 
 * Provides admin state and permission checking for the admin portal.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuthStore } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { checkIsAdmin } from '../api/adminApi'

interface UseAdminResult {
  isAdmin: boolean
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useAdmin(): UseAdminResult {
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasConfirmedRef = useRef(false)

  const user = useAuthStore(state => state.user)

  const fetchAdminStatus = useCallback(async () => {
    if (!user) {
      setIsAdmin(false)
      setIsLoading(false)
      hasConfirmedRef.current = false
      return
    }

    // Only show loading spinner on initial check, not on token-refresh re-checks
    if (!hasConfirmedRef.current) {
      setIsLoading(true)
    }
    setError(null)

    try {
      const adminStatus = await checkIsAdmin()
      setIsAdmin(adminStatus)
      if (adminStatus) hasConfirmedRef.current = true
    } catch (err) {
      logger.error('[useAdmin] Failed to check admin status:', err)
      setError(err instanceof Error ? err.message : 'Failed to verify admin status')
      setIsAdmin(false)
      hasConfirmedRef.current = false
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchAdminStatus()
  }, [fetchAdminStatus])

  return {
    isAdmin,
    isLoading,
    error,
    refetch: fetchAdminStatus,
  }
}
