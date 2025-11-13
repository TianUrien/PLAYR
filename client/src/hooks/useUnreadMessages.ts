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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.__updateUnreadBadge = adjust
    window.__refreshUnreadBadge = () => {
      void refresh({ bypassCache: true })
    }

    return () => {
      delete window.__updateUnreadBadge
      delete window.__refreshUnreadBadge
    }
  }, [adjust, refresh])

  return { count, adjust, refresh }
}
