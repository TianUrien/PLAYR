import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import {
  clearNotifications,
  fetchNotificationCounts,
  fetchNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationCounts,
  type NotificationFilter,
  type NotificationKind,
  type NotificationRecord,
} from '@/lib/api/notifications'

const DEFAULT_PAGE_SIZE = 30

type NotificationListQueryParams = {
  filter: NotificationFilter
  kind?: NotificationKind
  pageSize: number
}

export const notificationsQueryKeys = {
  all: () => ['notifications'] as const,
  listPrefix: () => ['notifications', 'list'] as const,
  list: (params: NotificationListQueryParams) => ['notifications', 'list', params] as const,
  counts: () => ['notifications', 'counts'] as const,
}

type UseNotificationsOptions = {
  filter?: NotificationFilter
  kind?: NotificationKind
  pageSize?: number
  enabled?: boolean
}

export const useNotifications = (options: UseNotificationsOptions = {}) => {
  const filter = options.filter ?? 'all'
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const requiresKind = filter === 'by_type'

  const query = useInfiniteQuery<NotificationRecord[]>({
    queryKey: notificationsQueryKeys.list({ filter, kind: options.kind, pageSize }),
    initialPageParam: 0,
    enabled: (options.enabled ?? true) && (!requiresKind || Boolean(options.kind)),
    getNextPageParam: (lastPage, allPages) => (lastPage.length < pageSize ? undefined : allPages.length),
    queryFn: async ({ pageParam }) => {
      const pageIndex = typeof pageParam === 'number' ? pageParam : 0
      return await fetchNotificationsPage({
        filter,
        kind: options.kind,
        limit: pageSize,
        offset: pageIndex * pageSize,
      })
    },
  })

  const notifications = query.data?.pages.flat() ?? []
  return { ...query, notifications }
}

export const useNotificationCounts = () => {
  return useQuery({
    queryKey: notificationsQueryKeys.counts(),
    queryFn: fetchNotificationCounts,
    refetchOnWindowFocus: false,
    refetchInterval: 120_000,
  })
}

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => await markNotificationRead(notificationId),
    onSuccess: (didUpdate, notificationId) => {
      if (!didUpdate) {
        return
      }

      const nowIso = new Date().toISOString()
      updateNotificationListCaches(
        queryClient,
        (notification) => ({
          ...notification,
          readAt: notification.readAt ?? nowIso,
          seenAt: notification.seenAt ?? nowIso,
        }),
        (notification) => notification.id === notificationId
      )

      adjustNotificationCounts(queryClient, (counts) => ({
        ...counts,
        unreadCount: Math.max(counts.unreadCount - 1, 0),
      }))
    },
  })
}

type MarkAllVariables = {
  kind?: NotificationKind
}

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables?: MarkAllVariables) =>
      await markAllNotificationsRead(variables?.kind),
    onSuccess: (updatedCount, variables) => {
      const nowIso = new Date().toISOString()
      updateNotificationListCaches(
        queryClient,
        (notification) => ({
          ...notification,
          readAt: notification.readAt ?? nowIso,
          seenAt: notification.seenAt ?? nowIso,
        }),
        variables?.kind ? (notification) => notification.kind === variables.kind : undefined
      )

      adjustNotificationCounts(queryClient, (counts) => ({
        ...counts,
        unreadCount: Math.max(counts.unreadCount - updatedCount, 0),
      }))
    },
  })
}

type ClearNotificationsVariables = {
  notificationIds?: string[]
  kind?: NotificationKind
}

export const useClearNotifications = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (variables?: ClearNotificationsVariables) =>
      await clearNotifications(variables),
    onSuccess: (_, variables) => {
      removeNotificationsFromCaches(queryClient, (notification) => {
        if (variables?.notificationIds?.length) {
          return variables.notificationIds.includes(notification.id)
        }
        if (variables?.kind) {
          return notification.kind === variables.kind
        }
        return true
      })

      queryClient.invalidateQueries({ queryKey: notificationsQueryKeys.counts() })
    },
  })
}

type NotificationPages = InfiniteData<NotificationRecord[]>

type NotificationPredicate = (notification: NotificationRecord) => boolean

type NotificationUpdater = (notification: NotificationRecord) => NotificationRecord

const updateNotificationListCaches = (
  queryClient: QueryClient,
  updater: NotificationUpdater,
  predicate?: NotificationPredicate,
) => {
  const queries = queryClient.getQueriesData<NotificationPages>({
    queryKey: notificationsQueryKeys.listPrefix(),
  })

  queries.forEach(([key, data]) => {
    if (!data) {
      return
    }

    let changed = false
    const pages = data.pages.map((page) =>
      page.map((notification) => {
        if (predicate && !predicate(notification)) {
          return notification
        }
        const updated = updater(notification)
        if (updated !== notification) {
          changed = true
        }
        return updated
      })
    )

    if (changed) {
      queryClient.setQueryData(key, { ...data, pages })
    }
  })
}

const removeNotificationsFromCaches = (queryClient: QueryClient, predicate: NotificationPredicate) => {
  const queries = queryClient.getQueriesData<NotificationPages>({
    queryKey: notificationsQueryKeys.listPrefix(),
  })

  queries.forEach(([key, data]) => {
    if (!data) {
      return
    }

    let changed = false
    const pages = data.pages.map((page) => {
      const filtered = page.filter((notification) => !predicate(notification))
      if (filtered.length !== page.length) {
        changed = true
      }
      return filtered
    })

    if (changed) {
      queryClient.setQueryData(key, { ...data, pages })
    }
  })
}

const adjustNotificationCounts = (
  queryClient: QueryClient,
  updater: (counts: NotificationCounts) => NotificationCounts,
) => {
  queryClient.setQueryData<NotificationCounts | undefined>(
    notificationsQueryKeys.counts(),
    (current) => (current ? updater(current) : current)
  )
}
