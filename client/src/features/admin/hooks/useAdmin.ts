/**
 * useAdmin Hook
 * 
 * Provides admin state and permission checking for the admin portal.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/lib/auth'
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
  
  const user = useAuthStore(state => state.user)

  const fetchAdminStatus = useCallback(async () => {
    if (!user) {
      setIsAdmin(false)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const adminStatus = await checkIsAdmin()
      setIsAdmin(adminStatus)
    } catch (err) {
      console.error('[useAdmin] Failed to check admin status:', err)
      setError(err instanceof Error ? err.message : 'Failed to verify admin status')
      setIsAdmin(false)
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
