import { useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { Bell, UserPlus, MessageCircle, X } from 'lucide-react'
import { useNavigate, useLocation } from 'react-router-dom'
import Avatar from './Avatar'
import { useNotificationStore } from '@/lib/notifications'
import { useToastStore } from '@/lib/toast'
import { cn } from '@/lib/utils'

export default function NotificationsDrawer() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationKey = `${location.pathname}${location.search}`
  const lastLocationKey = useRef(locationKey)
  const { addToast } = useToastStore()
  const isOpen = useNotificationStore((state) => state.isDrawerOpen)
  const toggleDrawer = useNotificationStore((state) => state.toggleDrawer)
  const notifications = useNotificationStore((state) => state.notifications)
  const markAllRead = useNotificationStore((state) => state.markAllRead)
  const respondToFriendRequest = useNotificationStore((state) => state.respondToFriendRequest)
  const pendingFriendshipId = useNotificationStore((state) => state.pendingFriendshipId)

  const friendRequests = notifications.filter((notification) => notification.kind === 'friend_request')
  const commentAlerts = notifications.filter((notification) => notification.kind === 'profile_comment')

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

  const handleCommentNavigate = () => {
    toggleDrawer(false)
    navigate('/dashboard/profile?tab=comments')
  }

  const resolvePublicProfilePath = (actor?: (typeof notifications)[number]['actor']) => {
    if (!actor?.id) {
      return null
    }

    const role = actor.role?.toLowerCase()
    return role === 'club' ? `/clubs/id/${actor.id}` : `/players/id/${actor.id}`
  }

  const renderFriendRequest = (notification: (typeof notifications)[number]) => {
    const actor = notification.actor
    const fullName = actor.fullName || actor.username || 'PLAYR member'
    const role = actor.role ?? 'member'
    const location = actor.baseLocation
    const displayTime = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

    const friendshipId = notification.sourceEntityId
    const profilePath = resolvePublicProfilePath(actor)
    const navigateToProfile = () => {
      if (!profilePath) {
        return
      }
      toggleDrawer(false)
      navigate(profilePath)
    }

    return (
      <div
        key={notification.id}
        className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:p-5"
      >
        <div className="flex items-start gap-3 sm:items-center">
          <button
            type="button"
            onClick={navigateToProfile}
            disabled={!profilePath}
            aria-label={`View ${fullName} profile`}
            className="group flex-shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed"
          >
            <Avatar
              src={actor.avatarUrl ?? undefined}
              initials={(fullName || '?').slice(0, 2)}
              size="md"
              className="transition group-hover:scale-[1.02]"
            />
          </button>
          <div className="space-y-1">
            <button
              type="button"
              onClick={navigateToProfile}
              disabled={!profilePath}
              className="text-left text-base font-semibold text-gray-900 transition hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {fullName}
            </button>
            <p className="text-sm text-gray-600 capitalize">{role}</p>
            {location && <p className="text-xs text-gray-500">{location}</p>}
            <div className="text-xs text-gray-500">{displayTime}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
            <UserPlus className="h-3.5 w-3.5" />
            Friend request
          </span>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              onClick={() => friendshipId && handleFriendRequest(friendshipId, 'accept')}
              disabled={!friendshipId || pendingFriendshipId === friendshipId}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#6366f1] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4f46e5] disabled:opacity-60 sm:min-w-[120px]"
            >
              Accept
            </button>
            <button
              onClick={() => friendshipId && handleFriendRequest(friendshipId, 'decline')}
              disabled={!friendshipId || pendingFriendshipId === friendshipId}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 sm:min-w-[120px]"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderCommentAlert = (notification: (typeof notifications)[number]) => {
    const actor = notification.actor
    const fullName = actor.fullName || actor.username || 'PLAYR member'
    const role = actor.role ?? 'member'
    const snippet = typeof notification.payload.snippet === 'string' ? notification.payload.snippet : ''
    const displayTime = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })

    return (
      <button
        key={notification.id}
        onClick={handleCommentNavigate}
        className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md sm:p-5"
      >
        <div className="flex items-start gap-3">
          <Avatar src={actor.avatarUrl ?? undefined} initials={(fullName || '?').slice(0, 2)} size="md" />
          <div className="flex-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-base font-semibold text-gray-900">{fullName}</p>
                <p className="text-xs uppercase tracking-wide text-gray-500">{role}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <MessageCircle className="h-3.5 w-3.5" />
                Commented
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-700 line-clamp-3 sm:line-clamp-2">{snippet}</p>
            <p className="mt-2 text-xs text-gray-500">{displayTime}</p>
          </div>
        </div>
      </button>
    )
  }

  const friendRequestSection = friendRequests.length > 0 ? (
    <div className="space-y-3">
      {friendRequests.map((notification) => renderFriendRequest(notification))}
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
      No pending friend requests.
    </div>
  )

  const commentSection = commentAlerts.length > 0 ? (
    <div className="space-y-3">
      {commentAlerts.map((notification) => renderCommentAlert(notification))}
    </div>
  ) : (
    <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
      No new profile comments.
    </div>
  )

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
        <div className="flex h-full w-full flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-indigo-50 p-2 text-indigo-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">Notifications</p>
                <p className="text-sm text-gray-500">Friend requests and profile comments.</p>
              </div>
            </div>
            <button
              onClick={() => toggleDrawer(false)}
              className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close notifications"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50 px-4 py-5 sm:px-6 sm:py-6 md:bg-white">
            <div className="space-y-6">
              <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5 md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Friend Requests</h3>
                {friendRequestSection}
              </section>
              <section className="rounded-3xl bg-white p-4 shadow-sm sm:p-5 md:rounded-none md:bg-transparent md:p-0 md:shadow-none">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">New Comments</h3>
                {commentSection}
              </section>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
