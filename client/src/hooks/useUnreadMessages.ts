import { useEffect } from 'react'
import { useAuthStore } from '@/lib/auth'
import { useUnreadStore } from '@/lib/unread'

export function useUnreadMessages() {
  const userId = useAuthStore(state => state.user?.id ?? null)
  const count = useUnreadStore(state => state.count)
  const initialize = useUnreadStore(state => state.initialize)
  const adjust = useUnreadStore(state => state.adjust)
  const refresh = useUnreadStore(state => state.refresh)
  const reset = useUnreadStore(state => state.reset)

  useEffect(() => {
    void initialize(userId)

    return () => {
      if (!userId) {
        reset()
      }
    }
  }, [initialize, reset, userId])

  return { count, adjust, refresh }
}
