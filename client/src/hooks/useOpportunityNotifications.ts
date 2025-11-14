import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import { useOpportunityNotificationStore } from '@/lib/opportunityNotifications'

export function useOpportunityNotifications() {
  const userId = useAuthStore(state => state.user?.id ?? null)
  const count = useOpportunityNotificationStore(state => state.count)
  const initialize = useOpportunityNotificationStore(state => state.initialize)
  const markSeen = useOpportunityNotificationStore(state => state.markSeen)
  const refresh = useOpportunityNotificationStore(state => state.refresh)

  useEffect(() => {
    void initialize(userId)
  }, [initialize, userId])

  return {
    count,
    markSeen,
    refresh
  }
}
