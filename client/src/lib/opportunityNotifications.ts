import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { requestCache, generateCacheKey } from './requestCache'
import { monitor } from './monitor'

interface RefreshOptions {
  bypassCache?: boolean
}

interface OpportunityNotificationState {
  count: number
  loading: boolean
  userId: string | null
  channel: RealtimeChannel | null
  initialize: (userId: string | null) => Promise<void>
  refresh: (options?: RefreshOptions) => Promise<number>
  markSeen: () => Promise<void>
  reset: () => void
}

const fetchOpportunityCount = async (userId: string, options?: RefreshOptions): Promise<number> => {
  const cacheKey = generateCacheKey('opportunity_alerts', { userId })
  if (options?.bypassCache) {
    requestCache.invalidate(cacheKey)
  }

  try {
    const count = await monitor.measure(
      'fetch_opportunity_alerts',
      async () => {
        return await requestCache.dedupe(
          cacheKey,
          async () => {
            const { data, error } = await supabase.rpc('get_opportunity_alerts')

            if (error) {
              console.error('[OPPORTUNITY_ALERTS] Failed to fetch unseen opportunities:', error)
              return 0
            }

            if (typeof data === 'number') {
              return data
            }

            if (Array.isArray(data)) {
              const first = data[0] as { get_opportunity_alerts?: number; unseen_count?: number } | undefined
              return first?.get_opportunity_alerts ?? first?.unseen_count ?? 0
            }

            if (data && typeof data === 'object' && 'unseen_count' in data) {
              return Number((data as Record<string, unknown>).unseen_count) || 0
            }

            return 0
          },
          5000
        )
      },
      { userId }
    )

    return count
  } catch (error) {
    console.error('[OPPORTUNITY_ALERTS] Unexpected error fetching unseen opportunities:', error)
    return 0
  }
}

export const useOpportunityNotificationStore = create<OpportunityNotificationState>((set, get) => ({
  count: 0,
  loading: false,
  userId: null,
  channel: null,

  reset: () => {
    const { channel } = get()
    if (channel) {
      supabase.removeChannel(channel)
    }
    set({ count: 0, loading: false, userId: null, channel: null })
  },

  refresh: async (options?: RefreshOptions) => {
    const { userId } = get()
    if (!userId) {
      set({ count: 0, loading: false })
      return 0
    }

    set({ loading: true })
    const count = await fetchOpportunityCount(userId, options)
    set({ count, loading: false })
    return count
  },

  initialize: async (userId: string | null) => {
    const { userId: currentUserId, channel: currentChannel, refresh } = get()

    if (!userId) {
      get().reset()
      return
    }

    if (currentUserId !== userId) {
      if (currentChannel) {
        await supabase.removeChannel(currentChannel)
      }
      set({ channel: null, userId })
      await refresh({ bypassCache: true })
    } else if (!currentChannel) {
      await refresh({ bypassCache: true })
    }

    if (!get().channel) {
      const channel = supabase
        .channel(`vacancies-feed-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'vacancies'
          },
          payload => {
            const nextStatus = (payload.new as { status?: string } | null)?.status
            if (nextStatus === 'open') {
              void get().refresh({ bypassCache: true })
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'vacancies'
          },
          payload => {
            const nextStatus = (payload.new as { status?: string } | null)?.status
            const prevStatus = (payload.old as { status?: string } | null)?.status
            if (nextStatus === 'open' && prevStatus !== 'open') {
              void get().refresh({ bypassCache: true })
            }
          }
        )
        .subscribe()

      set({ channel })
    }
  },

  markSeen: async () => {
    const { userId, refresh } = get()
    if (!userId) {
      return
    }

    const { error } = await supabase.rpc('mark_opportunities_seen')

    if (error) {
      console.error('[OPPORTUNITY_ALERTS] Failed to mark opportunities as seen:', error)
      return
    }

    set({ count: 0 })
    await refresh({ bypassCache: true })
  }
}))
