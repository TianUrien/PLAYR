import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { requestCache, generateCacheKey } from './requestCache'
import { monitor } from './monitor'

type RefreshOptions = {
  bypassCache?: boolean
}

interface UnreadState {
  count: number
  loading: boolean
  userId: string | null
  channel: RealtimeChannel | null
  initialize: (userId: string | null) => Promise<void>
  refresh: (options?: RefreshOptions) => Promise<number>
  adjust: (delta: number) => void
  reset: () => void
}

let refreshTimeout: ReturnType<typeof setTimeout> | null = null

const fetchUnreadCount = async (userId: string, options?: RefreshOptions): Promise<number> => {
  const cacheKey = generateCacheKey('unread_count', { userId })
  if (options?.bypassCache) {
    requestCache.invalidate(cacheKey)
  }

  try {
    const count = await monitor.measure('fetch_unread_count', async () => {
      return await requestCache.dedupe(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('user_unread_counts_secure')
            .select('unread_count')
            .maybeSingle()

          if (error) {
            console.error('[UNREAD] Failed to fetch unread count:', error)
            return 0
          }

          return data?.unread_count ?? 0
        },
        5000
      )
    }, { userId })

    return count
  } catch (error) {
    console.error('[UNREAD] Unexpected error fetching unread count:', error)
    return 0
  }
}

export const useUnreadStore = create<UnreadState>((set, get) => ({
  count: 0,
  loading: false,
  userId: null,
  channel: null,

  reset: () => {
    const { channel } = get()
    if (channel) {
      supabase.removeChannel(channel)
    }
    if (refreshTimeout) {
      clearTimeout(refreshTimeout)
      refreshTimeout = null
    }
    set({ count: 0, loading: false, userId: null, channel: null })
  },

  adjust: (delta: number) => {
    set(state => ({ count: Math.max(0, state.count + delta) }))
  },

  refresh: async (options?: RefreshOptions) => {
    const { userId } = get()
    if (!userId) {
      set({ count: 0, loading: false })
      return 0
    }

    set({ loading: true })
    const count = await fetchUnreadCount(userId, options)
    set({ count, loading: false })
    return count
  },

  initialize: async (userId: string | null) => {
    const { userId: currentUserId, channel: existingChannel, refresh } = get()

    if (!userId) {
      get().reset()
      return
    }

    if (currentUserId !== userId) {
      if (existingChannel) {
        await supabase.removeChannel(existingChannel)
      }
      set({ channel: null, userId })
      await refresh({ bypassCache: true })
    } else if (!existingChannel) {
      await refresh({ bypassCache: true })
    }

    if (!get().channel) {
      const channel = supabase
        .channel(`unread-messages-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'messages'
        }, () => {
          if (refreshTimeout) {
            clearTimeout(refreshTimeout)
          }

          refreshTimeout = setTimeout(() => {
            get().refresh({ bypassCache: true })
          }, 250)
        })
        .subscribe()

      set({ channel })
    }
  }
}))
