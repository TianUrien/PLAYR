import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bell, MoreHorizontal, Search } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Avatar from './Avatar'
import { useNotificationStore } from '@/lib/notifications'
import { useToastStore } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { NotificationKind, NotificationRecord } from '@/lib/api/notifications'
import { getNotificationConfig, resolveNotificationRoute } from './notifications/config'

const FRIEND_REQUEST_KINDS = new Set<NotificationKind>(['friend_request_received'])
const QUICK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
] as const

type QuickFilter = (typeof QUICK_FILTERS)[number]['id']

const formatRelativeTime = (timestamp: string) =>
  formatDistanceToNow(new Date(timestamp), { addSuffix: true })

export default function NotificationsDrawer() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationKey = `${location.pathname}${location.search}`
  const lastLocationKey = useRef(locationKey)
  const [activeFilter, setActiveFilter] = useState<QuickFilter>('all')
  const { addToast } = useToastStore()
  const isOpen = useNotificationStore((state) => state.isDrawerOpen)
  const toggleDrawer = useNotificationStore((state) => state.toggleDrawer)
  const notifications = useNotificationStore((state) => state.notifications)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const refreshNotifications = useNotificationStore((state) => state.refresh)
  const respondToFriendRequest = useNotificationStore((state) => state.respondToFriendRequest)
  const pendingFriendshipId = useNotificationStore((state) => state.pendingFriendshipId)

  const sortedNotifications = useMemo(() => {
    return notifications
      .filter((notification) => !notification.clearedAt)
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [notifications])

  const unreadNotifications = useMemo(
    () => sortedNotifications.filter((notification) => !notification.readAt),
    [sortedNotifications]
  )

  const earlierNotifications = useMemo(
    () => sortedNotifications.filter((notification) => Boolean(notification.readAt)),
    [sortedNotifications]
  )

  const sectionedNotifications = useMemo(() => {
    if (activeFilter === 'unread') {
      return [
        {
          title: 'New',
          data: unreadNotifications,
        },
      ]
    }

    return [
      { title: 'New', data: unreadNotifications },
      { title: 'Earlier', data: earlierNotifications },
    ]
  }, [activeFilter, unreadNotifications, earlierNotifications])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    void refreshNotifications({ bypassCache: true })
  }, [isOpen, refreshNotifications])

  useEffect(() => {
    if (isOpen) {
      void markAllRead()
    }
  }, [isOpen, markAllRead])

  useEffect(() => {
    if (lastLocationKey.current !== locationKey) {
      lastLocationKey.current = locationKey
      if (isOpen) {
        toggleDrawer(false)
      }
    }
  }, [isOpen, locationKey, toggleDrawer])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        toggleDrawer(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, toggleDrawer])

  useEffect(() => {
    if (typeof document === 'undefined' || !isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  const handleFriendRequest = async (friendshipId: string, action: 'accept' | 'decline') => {
    const success = await respondToFriendRequest({ friendshipId, action })
    if (!success) {
      addToast('Could not update the friend request. Please try again.', 'error')
      return
    }

    addToast(
      action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.',
      'success'
    )
  }

  const resolvePublicProfilePath = (actor?: NotificationRecord['actor']) => {
    if (!actor?.id) {
      return null
    }

    const role = actor.role?.toLowerCase()
    return role === 'club' ? `/clubs/id/${actor.id}` : `/players/id/${actor.id}`
  }

  const navigateToRoute = (route: string | null) => {
    if (!route) {
      return
    }
    toggleDrawer(false)
    navigate(route)
  }

  const handleNotificationNavigate = (notification: NotificationRecord) => {
    const route = resolveNotificationRoute(notification)
    navigateToRoute(route)
  }

  const renderFriendRequestActions = (notification: NotificationRecord) => {
    if (!FRIEND_REQUEST_KINDS.has(notification.kind)) {
      return null
    }

    const friendshipId = notification.sourceEntityId
    const disabled = !friendshipId || pendingFriendshipId === friendshipId

    const onActionClick = (action: 'accept' | 'decline') => (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!friendshipId) {
        return
      }
      void handleFriendRequest(friendshipId, action)
    }

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onActionClick('accept')}
          disabled={disabled}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-[#0866FF] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a58d0] disabled:opacity-60 sm:flex-none"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={onActionClick('decline')}
          disabled={disabled}
          className="inline-flex flex-1 items-center justify-center rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 sm:flex-none"
        >
          Remove
        </button>
      </div>
    )
  }

  const renderNotificationItem = (notification: NotificationRecord) => {
    const config = getNotificationConfig(notification)
    const Icon = config.icon
    const actor = notification.actor
    const fullName = actor.fullName || actor.username || 'Miembro de PLAYR'
    const initials = fullName.slice(0, 2).toUpperCase()
    const displayTime = formatRelativeTime(notification.createdAt)
    const description = config.getDescription?.(notification)
    const isUnread = !notification.readAt
    const profileRoute = resolvePublicProfilePath(actor)

    const onAvatarClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      navigateToRoute(profileRoute)
    }

    const onCardClick = () => {
      handleNotificationNavigate(notification)
    }

    const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleNotificationNavigate(notification)
      }
    }

    const targetRoute = resolveNotificationRoute(notification)
    const isInteractive = Boolean(targetRoute)
    const interactiveProps = isInteractive
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick: onCardClick,
          onKeyDown: onCardKeyDown,
        }
      : {}

    return (
      <div
        key={notification.id}
        {...interactiveProps}
        className={cn(
          'group relative flex gap-3 rounded-3xl border border-transparent bg-white p-4 text-left shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0866FF]/40 hover:shadow-md',
          isUnread && 'border-[#c9dafc] bg-[#eaf3ff]'
        )}
      >
        <button
          type="button"
          onClick={profileRoute ? onAvatarClick : undefined}
          disabled={!profileRoute}
          className="relative h-fit focus-visible:outline-none"
          aria-label={profileRoute ? `Ver perfil de ${fullName}` : undefined}
        >
          <Avatar src={actor.avatarUrl ?? undefined} initials={initials} size="lg" className="shadow-sm" />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-white bg-white text-[#0866FF] shadow-md">
            <Icon className="h-3.5 w-3.5" />
          </span>
        </button>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[15px] font-semibold leading-snug text-gray-900">{config.getTitle(notification)}</p>
              {description && <p className="text-sm text-gray-600">{description}</p>}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="font-medium">{displayTime}</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0866FF]" />
                  {config.badgeText}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              {isUnread && <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-[#0866FF]" />}
              <button
                type="button"
                onClick={(event) => event.stopPropagation()}
                className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="More options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          </div>
          {renderFriendRequestActions(notification)}
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-50 bg-gray-900/30 transition-opacity duration-200',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => toggleDrawer(false)}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[60] flex w-full max-w-full transform bg-white shadow-2xl transition-transform duration-200 sm:max-w-md lg:max-w-lg',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex h-full w-full flex-col bg-[#f0f2f5]">
          <header className="border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold text-gray-900">Notifications</p>
                <p className="text-sm text-gray-500">Stay on top of your network.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  aria-label="Search notifications"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Search className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  aria-label="Notification settings"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Bell className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer(false)}
                  className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-700"
                  aria-label="Close notifications"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {QUICK_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setActiveFilter(filter.id)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm font-semibold transition',
                    activeFilter === filter.id
                      ? 'bg-[#0866FF] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            {sectionedNotifications.map((section) => (
              <div key={section.title} className="mb-6 last:mb-0">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {section.title}
                </p>
                {section.data.length > 0 ? (
                  <div className="space-y-3">
                    {section.data.map((notification) => renderNotificationItem(notification))}
                  </div>
                ) : (
                  <div className="rounded-3xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
                    {activeFilter === 'unread'
                      ? 'You have no new notifications right now.'
                      : "You're all caught up. We'll let you know when something new arrives."}
                  </div>
                )}
              </div>
            ))}
            {sortedNotifications.length === 0 && (
              <div className="rounded-3xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
                You're all caught up. We'll let you know when something happens.
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
