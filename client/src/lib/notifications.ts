import { create } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { monitor } from './monitor'
import { requestCache, generateCacheKey } from './requestCache'
import type { Database, Json } from './database.types'

const NOTIFICATION_LIMIT = 40

type NotificationKind = Database['public']['Enums']['profile_notification_kind']

type NotificationActor = {
  id: string | null
  fullName: string | null
  role: string | null
  username: string | null
  avatarUrl: string | null
  baseLocation: string | null
}

type NotificationPayload = Record<string, Json>

type NotificationRecord = {
  id: string
  kind: NotificationKind
  sourceEntityId: string | null
  payload: NotificationPayload
  createdAt: string
  readAt: string | null
  clearedAt: string | null
  actor: NotificationActor
}

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
  initialize: (userId: string | null) => Promise<void>
  toggleDrawer: (open?: boolean) => void
  refresh: (options?: RefreshOptions) => Promise<void>
  markAllRead: () => Promise<void>
  clearCommentNotifications: () => Promise<void>
  claimCommentHighlights: () => string[]
  respondToFriendRequest: (params: { friendshipId: string; action: 'accept' | 'decline' }) => Promise<boolean>
  dismissBySource: (kind: NotificationKind, sourceId: string | null) => void
}

type RpcRow = {
  id: string
  kind: NotificationKind
  source_entity_id: string | null
  payload: NotificationPayload | null
  created_at: string
  read_at: string | null
  cleared_at: string | null
  actor: {
    id?: string | null
    full_name?: string | null
    role?: string | null
    username?: string | null
    avatar_url?: string | null
    base_location?: string | null
  } | null
}

const normalizeNotification = (row: RpcRow): NotificationRecord => ({
  id: row.id,
  kind: row.kind,
  sourceEntityId: row.source_entity_id,
  payload: (row.payload ?? {}) as NotificationPayload,
  createdAt: row.created_at,
  readAt: row.read_at,
  clearedAt: row.cleared_at,
  actor: {
    id: row.actor?.id ?? null,
    fullName: row.actor?.full_name ?? null,
    role: row.actor?.role ?? null,
    username: row.actor?.username ?? null,
    avatarUrl: row.actor?.avatar_url ?? null,
    baseLocation: row.actor?.base_location ?? null,
  },
})

const fetchNotifications = async (userId: string, options?: RefreshOptions): Promise<NotificationRecord[]> => {
  const cacheKey = generateCacheKey('profile_notifications', { userId })
  if (options?.bypassCache) {
    requestCache.invalidate(cacheKey)
  }

  return await monitor.measure('fetch_profile_notifications', async () => {
    return await requestCache.dedupe(cacheKey, async () => {
      const { data, error } = await supabase.rpc('fetch_profile_notifications', {
        p_limit: NOTIFICATION_LIMIT,
        p_offset: 0,
      })

      if (error) {
        console.error('[NOTIFICATIONS] Failed to fetch notifications', error)
        return []
      }

      const rows = (data ?? []) as RpcRow[]
      return rows.map(normalizeNotification)
    }, 3000)
  }, { userId })
}

const extractCommentId = (notification: NotificationRecord): string | null => {
  if (notification.kind !== 'profile_comment') {
    return null
  }

  const value = notification.payload?.comment_id
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

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isDrawerOpen: false,
  loading: false,
  userId: null,
  channel: null,
  pendingFriendshipId: null,
  pendingCommentHighlights: new Set<string>(),
  commentHighlightVersion: 0,

  toggleDrawer: (open) => {
    const currentOpen = get().isDrawerOpen
    const nextOpen = typeof open === 'boolean' ? open : !currentOpen
    if (currentOpen === nextOpen) {
      return
    }
    set({ isDrawerOpen: nextOpen })
  },

  initialize: async (userId: string | null) => {
    const { userId: currentUserId, channel } = get()

    if (!userId) {
      if (channel) {
        await supabase.removeChannel(channel)
      }
      set({
        userId: null,
        channel: null,
        notifications: [],
        unreadCount: 0,
        pendingCommentHighlights: new Set<string>(),
        commentHighlightVersion: 0,
      })
      return
    }

    if (currentUserId === userId && channel) {
      return
    }

    if (channel) {
      await supabase.removeChannel(channel)
    }

    set({ userId, channel: null })
    await get().refresh({ bypassCache: true })

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
        (payload) => {
          const record = payload.new ?? payload.old
          if (!record) {
            return
          }

          const normalized = normalizeNotification(record as RpcRow)
          set((state) => ({
            ...upsertNotification(normalized, state),
          }))
        }
      )
      .subscribe()

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

    set({ notifications: rows, unreadCount, loading: false, pendingCommentHighlights: pendingHighlights, commentHighlightVersion: highlightVersion })
  },

  markAllRead: async () => {
    const { userId } = get()
    if (!userId) {
      return
    }

    const { error } = await supabase.rpc('mark_profile_notifications_read')
    if (error) {
      console.error('[NOTIFICATIONS] Failed to mark notifications read', error)
      return
    }

    set((state) => ({
      notifications: state.notifications.map((item) => ({
        ...item,
        readAt: item.readAt ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }))
  },

  clearCommentNotifications: async () => {
    const { userId } = get()
    if (!userId) {
      return
    }

    const { error } = await supabase.rpc('clear_profile_notifications', {
      p_kind: 'profile_comment',
    })

    if (error) {
      console.error('[NOTIFICATIONS] Failed to clear comment notifications', error)
      return
    }

    set((state) => {
      const next = state.notifications.filter((item) => item.kind !== 'profile_comment')
      const unreadCount = next.filter((item) => !item.readAt).length
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
        unreadCount: state.notifications.filter((item) => item.sourceEntityId !== friendshipId && !item.readAt).length,
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
      const unreadCount = next.filter((item) => !item.readAt).length
      return { notifications: next, unreadCount }
    })
  },
}))
