import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import { useOpportunityNotificationStore } from '@/lib/opportunityNotifications'

export function useOpportunityNotifications() {
  const userId = useAuthStore(state => state.user?.id ?? null)
  const count = useOpportunityNotificationStore(state => state.count)
  const lastSeenAt = useOpportunityNotificationStore(state => state.lastSeenAt)
  const initialize = useOpportunityNotificationStore(state => state.initialize)
  const markSeen = useOpportunityNotificationStore(state => state.markSeen)
  const refresh = useOpportunityNotificationStore(state => state.refresh)
  const subscribe = useOpportunityNotificationStore(state => state.subscribe)
  const unsubscribe = useOpportunityNotificationStore(state => state.unsubscribe)

  // Track subscriber count for proper interval cleanup
  useEffect(() => {
    subscribe()
    return () => {
      unsubscribe()
    }
  }, [subscribe, unsubscribe])

  // Initialize when userId changes
  useEffect(() => {
    void initialize(userId)
  }, [initialize, userId])

  return {
    count,
    lastSeenAt,
    markSeen,
    refresh
  }
}
