import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { requestCache, generateCacheKey } from './requestCache'
import {
  fetchNotificationsPage,
  markAllNotificationsRead as markAllNotificationsReadRpc,
  clearNotifications as clearNotificationsRpc,
  type NotificationKind,
  type NotificationRecord,
  type NotificationMetadata,
} from './api/notifications'
import type { Tables } from './database.types'

const NOTIFICATION_LIMIT = 40
const HEARTBEAT_INTERVAL_MS = 60_000
const CHANNEL_RECONNECT_BASE_DELAY_MS = 2000
const CHANNEL_RECONNECT_MAX_DELAY_MS = 30_000
let lifecycleListenersBound = false

type ProfileNotificationRow = Tables<'profile_notifications'>

const mapRealtimeNotification = (row: ProfileNotificationRow): NotificationRecord => ({
  id: row.id,
  kind: row.kind,
  sourceEntityId: row.source_entity_id,
  metadata: (row.metadata ?? {}) as NotificationMetadata,
  targetUrl: row.target_url,
  createdAt: row.created_at,
  readAt: row.read_at,
  seenAt: row.seen_at,
  clearedAt: row.cleared_at,
  actor: {
    id: row.actor_profile_id,
    fullName: null,
    role: null,
    username: null,
    avatarUrl: null,
    baseLocation: null,
  },
})

interface RefreshOptions {
  bypassCache?: boolean
}

interface NotificationState {
  notifications: NotificationRecord[]
  unreadCount: number
  isDrawerOpen: boolean
  loading: boolean
  userId: string | null
  channel: RealtimeChannel | null
  pendingFriendshipId: string | null
  pendingCommentHighlights: Set<string>
  commentHighlightVersion: number
  heartbeatIntervalId: number | null
  reconnectTimeoutId: number | null
  reconnectAttempts: number
  initialize: (userId: string | null, options?: { force?: boolean }) => Promise<void>
  toggleDrawer: (open?: boolean) => void
  refresh: (options?: RefreshOptions) => Promise<void>
  markAllRead: () => Promise<void>
  clearCommentNotifications: () => Promise<void>
  claimCommentHighlights: () => string[]
  respondToFriendRequest: (params: { friendshipId: string; action: 'accept' | 'decline' }) => Promise<boolean>
  dismissBySource: (kind: NotificationKind, sourceId: string | null) => void
}


const fetchNotifications = async (userId: string, options?: RefreshOptions): Promise<NotificationRecord[]> => {
  const cacheKey = generateCacheKey('profile_notifications', { userId })
  if (options?.bypassCache) {
    requestCache.invalidate(cacheKey)
  }

  return await requestCache.dedupe(cacheKey, async () => {
    try {
      return await fetchNotificationsPage({
        filter: 'all',
        limit: NOTIFICATION_LIMIT,
        offset: 0,
      })
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to fetch notifications', error)
      return []
    }
  }, 3000)
}

const extractCommentId = (notification: NotificationRecord): string | null => {
  if (notification.kind !== 'profile_comment_created') {
    return null
  }

  const value = notification.metadata?.['comment_id']
  if (typeof value === 'string' && value) {
    return value
  }

  return null
}

const upsertNotification = (
  notification: NotificationRecord,
  state: Pick<NotificationState, 'notifications' | 'pendingCommentHighlights' | 'commentHighlightVersion'>
) => {
  const next = [...state.notifications]
  const index = next.findIndex((item) => item.id === notification.id)

  if (notification.clearedAt) {
    if (index >= 0) {
      next.splice(index, 1)
    }
  } else if (index >= 0) {
    next[index] = notification
  } else {
    next.unshift(notification)
    next.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }

  let pendingHighlights = state.pendingCommentHighlights
  let highlightVersion = state.commentHighlightVersion
  const commentId = extractCommentId(notification)

  if (commentId) {
    const shouldHighlight = !notification.readAt && !notification.clearedAt
    if (shouldHighlight) {
      const clone = new Set(pendingHighlights)
      clone.add(commentId)
      pendingHighlights = clone
      highlightVersion += 1
    } else if (pendingHighlights.has(commentId)) {
      const clone = new Set(pendingHighlights)
      clone.delete(commentId)
      pendingHighlights = clone
      highlightVersion += 1
    }
  }

  const unreadCount = next.filter((item) => !item.readAt && !item.clearedAt).length

  return {
    notifications: next,
    pendingCommentHighlights: pendingHighlights,
    commentHighlightVersion: highlightVersion,
    unreadCount,
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => {
  const isBrowser = typeof window !== 'undefined'
  const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)
  const isPageHidden = () => (typeof document === 'undefined' ? false : document.visibilityState === 'hidden')

  const clearHeartbeat = () => {
    const heartbeatIntervalId = get().heartbeatIntervalId
    if (heartbeatIntervalId !== null && isBrowser) {
      window.clearInterval(heartbeatIntervalId)
      set({ heartbeatIntervalId: null })
    }
  }

  const clearReconnectTimeout = () => {
    const reconnectTimeoutId = get().reconnectTimeoutId
    if (reconnectTimeoutId !== null && isBrowser) {
      window.clearTimeout(reconnectTimeoutId)
      set({ reconnectTimeoutId: null })
    }
  }

  const scheduleReconnect = () => {
    if (!isBrowser || !isOnline()) {
      return
    }
    clearHeartbeat()
    const { reconnectTimeoutId, reconnectAttempts, userId } = get()
    if (reconnectTimeoutId !== null || !userId) {
      return
    }
    const delay = Math.min(
      CHANNEL_RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts),
      CHANNEL_RECONNECT_MAX_DELAY_MS
    )
    const timeoutId = window.setTimeout(() => {
      set({ reconnectTimeoutId: null, reconnectAttempts: reconnectAttempts + 1 })
      void get().initialize(userId, { force: true })
    }, delay)
    set({ reconnectTimeoutId: timeoutId })
  }

  const performHeartbeat = () => {
    if (!isBrowser || isPageHidden()) {
      return
    }

    const { userId, channel } = get()
    if (!userId) {
      return
    }

    void get().refresh({ bypassCache: true })

    if (!channel) {
      scheduleReconnect()
      return
    }

    channel
      .send({
        type: 'broadcast',
        event: 'heartbeat',
        payload: { timestamp: Date.now() },
      })
      .then((response) => {
        if (response !== 'ok') {
          scheduleReconnect()
        }
      })
      .catch((error) => {
        console.error('[NOTIFICATIONS] Heartbeat failed', error)
        scheduleReconnect()
      })
  }

  const startHeartbeat = () => {
    if (!isBrowser) {
      return
    }
    clearHeartbeat()
    performHeartbeat()
    const intervalId = window.setInterval(() => {
      performHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)
    set({ heartbeatIntervalId: intervalId })
  }

  const bindLifecycleEvents = () => {
    if (!isBrowser || lifecycleListenersBound) {
      return
    }

    const handleVisibilityChange = () => {
      if (!isPageHidden()) {
        performHeartbeat()
      }
    }

    const handleOnline = () => {
      const { userId } = get()
      if (!userId) {
        return
      }
      clearHeartbeat()
      clearReconnectTimeout()
      set({ reconnectAttempts: 0 })
      void get().initialize(userId, { force: true })
    }

    const handleOffline = () => {
      clearHeartbeat()
      clearReconnectTimeout()
    }

    window.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    lifecycleListenersBound = true
  }

  const teardownChannel = async () => {
    const { channel } = get()
    clearHeartbeat()
    clearReconnectTimeout()
    if (channel) {
      await supabase.removeChannel(channel)
    }
  }

  const attachChannel = (userId: string) => {
    const nextChannel = supabase
      .channel(`profile-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profile_notifications',
          filter: `recipient_profile_id=eq.${userId}`,
        },
        (change) => {
          const record = change.new ?? change.old
          if (!record) {
            return
          }

          const normalized = mapRealtimeNotification(record as ProfileNotificationRow)
          set((state) => ({
            ...upsertNotification(normalized, state),
          }))
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          set({ reconnectAttempts: 0 })
          clearReconnectTimeout()
          startHeartbeat()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReconnect()
        }
      })

    return nextChannel
  }

  return {
    notifications: [],
    unreadCount: 0,
    isDrawerOpen: false,
    loading: false,
    userId: null,
    channel: null,
    pendingFriendshipId: null,
    pendingCommentHighlights: new Set<string>(),
    commentHighlightVersion: 0,
    heartbeatIntervalId: null,
    reconnectTimeoutId: null,
    reconnectAttempts: 0,

    toggleDrawer: (open) => {
      const currentOpen = get().isDrawerOpen
      const nextOpen = typeof open === 'boolean' ? open : !currentOpen
      if (currentOpen === nextOpen) {
        return
      }
      set({ isDrawerOpen: nextOpen })
    },

    initialize: async (userId: string | null, options?: { force?: boolean }) => {
      const { userId: currentUserId, channel } = get()

      if (!userId) {
        await teardownChannel()
        set({
          userId: null,
          channel: null,
          notifications: [],
          unreadCount: 0,
          pendingCommentHighlights: new Set<string>(),
          commentHighlightVersion: 0,
          reconnectAttempts: 0,
        })
        return
      }

      bindLifecycleEvents()

      if (!options?.force && currentUserId === userId && channel) {
        return
      }

      await teardownChannel()
      set({ userId, channel: null })
      await get().refresh({ bypassCache: true })

      const nextChannel = attachChannel(userId)
      set({ channel: nextChannel })
    },

    refresh: async (options?: RefreshOptions) => {
      const { userId } = get()
      if (!userId) {
        set({ notifications: [], unreadCount: 0 })
        return
      }

      set({ loading: true })
      const rows = await fetchNotifications(userId, options)

      let pendingHighlights = get().pendingCommentHighlights
      let highlightVersion = get().commentHighlightVersion

      rows.forEach((notification) => {
        const commentId = extractCommentId(notification)
        if (commentId && !notification.readAt && !notification.clearedAt) {
          if (!pendingHighlights.has(commentId)) {
            const clone = new Set(pendingHighlights)
            clone.add(commentId)
            pendingHighlights = clone
            highlightVersion += 1
          }
        }
      })

      const unreadCount = rows.filter((item) => !item.readAt && !item.clearedAt).length

      set({
        notifications: rows,
        unreadCount,
        loading: false,
        pendingCommentHighlights: pendingHighlights,
        commentHighlightVersion: highlightVersion,
      })
    },

    markAllRead: async () => {
      const { userId } = get()
      if (!userId) {
        return
      }

      try {
        await markAllNotificationsReadRpc()
      } catch (error) {
        console.error('[NOTIFICATIONS] Failed to mark notifications read', error)
        return
      }

      const nowIso = new Date().toISOString()
      set((state) => ({
        notifications: state.notifications.map((item) => ({
          ...item,
          readAt: item.readAt ?? nowIso,
          seenAt: item.seenAt ?? nowIso,
        })),
        unreadCount: 0,
      }))
    },

    clearCommentNotifications: async () => {
      const { userId } = get()
      if (!userId) {
        return
      }

      try {
        await clearNotificationsRpc({ kind: 'profile_comment_created' })
      } catch (error) {
        console.error('[NOTIFICATIONS] Failed to clear comment notifications', error)
        return
      }

      set((state) => {
        const next = state.notifications.filter((item) => item.kind !== 'profile_comment_created')
        const unreadCount = next.filter((item) => !item.readAt && !item.clearedAt).length
        return {
          notifications: next,
          unreadCount,
          pendingCommentHighlights: new Set<string>(),
          commentHighlightVersion: state.commentHighlightVersion + 1,
        }
      })
    },

    claimCommentHighlights: () => {
      const { pendingCommentHighlights } = get()
      if (pendingCommentHighlights.size === 0) {
        return []
      }

      const ids = Array.from(pendingCommentHighlights)
      set({ pendingCommentHighlights: new Set<string>(), commentHighlightVersion: get().commentHighlightVersion + 1 })
      return ids
    },

    respondToFriendRequest: async ({ friendshipId, action }) => {
      if (!friendshipId) {
        return false
      }

      set({ pendingFriendshipId: friendshipId })

      try {
        const nextStatus = action === 'accept' ? 'accepted' : 'rejected'
        const { error } = await supabase
          .from('profile_friendships')
          .update({ status: nextStatus })
          .eq('id', friendshipId)

        if (error) {
          console.error('[NOTIFICATIONS] Failed to update friend request', error)
          return false
        }

        set((state) => ({
          pendingFriendshipId: null,
          notifications: state.notifications.filter((item) => item.sourceEntityId !== friendshipId),
          unreadCount: state.notifications.filter(
            (item) => item.sourceEntityId !== friendshipId && !item.readAt && !item.clearedAt
          ).length,
        }))

        return true
      } finally {
        set((state) => (state.pendingFriendshipId === friendshipId ? { pendingFriendshipId: null } : {}))
      }
    },

    dismissBySource: (kind, sourceId) => {
      if (!sourceId) {
        return
      }

      set((state) => {
        const next = state.notifications.filter((item) => !(item.kind === kind && item.sourceEntityId === sourceId))
        const unreadCount = next.filter((item) => !item.readAt && !item.clearedAt).length
        return { notifications: next, unreadCount }
      })
    },
  }
})
