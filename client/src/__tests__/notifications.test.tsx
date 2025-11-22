import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import NotificationBadge from '@/components/NotificationBadge'
import NotificationsDrawer from '@/components/NotificationsDrawer'
import type { NotificationRecord } from '@/lib/api/notifications'

type NotificationStoreSlice = {
  isDrawerOpen: boolean
  notifications: NotificationRecord[]
  markAllRead: () => Promise<void> | void
  toggleDrawer: (open?: boolean) => void
  respondToFriendRequest: (params: { friendshipId: string; action: 'accept' | 'decline' }) => Promise<boolean>
  pendingFriendshipId: string | null
  claimCommentHighlights: () => string[]
  clearCommentNotifications: () => Promise<void> | void
  commentHighlightVersion: number
}

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const addToast = vi.fn()

vi.mock('@/lib/toast', () => ({
  useToastStore: () => ({ addToast }),
}))

const createNotification = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'notif-1',
  kind: 'friend_request_received',
  sourceEntityId: 'source-1',
  metadata: {},
  targetUrl: null,
  createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  readAt: null,
  seenAt: null,
  clearedAt: null,
  actor: {
    id: 'actor-1',
    fullName: 'Jordan Hall',
    role: 'player',
    username: 'jordan',
    avatarUrl: null,
    baseLocation: 'London',
  },
  ...overrides,
})

const defaultNotificationStore = (): NotificationStoreSlice => ({
  isDrawerOpen: false,
  notifications: [],
  markAllRead: vi.fn(),
  toggleDrawer: vi.fn(),
  respondToFriendRequest: vi.fn().mockResolvedValue(true),
  pendingFriendshipId: null,
  claimCommentHighlights: vi.fn(() => []),
  clearCommentNotifications: vi.fn(),
  commentHighlightVersion: 0,
})

let notificationStoreState = defaultNotificationStore()

const setNotificationStoreState = (overrides: Partial<NotificationStoreSlice> = {}) => {
  notificationStoreState = { ...defaultNotificationStore(), ...overrides }
}

vi.mock('@/lib/notifications', () => ({
  useNotificationStore: (selector: (state: NotificationStoreSlice) => unknown) => selector(notificationStoreState),
}))

const user = userEvent.setup()

describe('NotificationBadge', () => {
  it('hides when there are no unread notifications', () => {
    const { rerender } = render(<NotificationBadge count={0} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rerender(<NotificationBadge count={3} />)
    expect(screen.getByRole('status')).toHaveTextContent('3')
  })

  it('caps the count at the configured max', () => {
    render(<NotificationBadge count={15} maxDisplay={9} />)
    expect(screen.getByText('9+')).toBeInTheDocument()
  })
})

describe('NotificationsDrawer', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    addToast.mockReset()
    setNotificationStoreState()
  })

  it('marks all notifications as read when opened', async () => {
    const markAllRead = vi.fn()
    setNotificationStoreState({ isDrawerOpen: true, markAllRead })

    render(
      <MemoryRouter>
        <NotificationsDrawer />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(markAllRead).toHaveBeenCalled()
    })
  })

  it('allows accepting friend requests and shows success toasts', async () => {
    const respondToFriendRequest = vi.fn().mockResolvedValue(true)
    const notifications = [
      createNotification({
        kind: 'friend_request_received',
        sourceEntityId: 'friendship-19',
      }),
    ]

    setNotificationStoreState({
      isDrawerOpen: true,
      notifications,
      respondToFriendRequest,
    })

    render(
      <MemoryRouter>
        <NotificationsDrawer />
      </MemoryRouter>
    )

    await user.click(screen.getByText('Accept'))

    await waitFor(() => {
      expect(respondToFriendRequest).toHaveBeenCalledWith({ friendshipId: 'friendship-19', action: 'accept' })
    })
    expect(addToast).toHaveBeenCalledWith('Friend request accepted.', 'success')
  })

  it('navigates to the friends tab for reference requests', async () => {
    setNotificationStoreState({
      isDrawerOpen: true,
      notifications: [
        createNotification({
          id: 'reference-1',
          kind: 'reference_request_received',
          metadata: { relationship_type: 'Coach', request_note: 'Coached U16s' },
        }),
      ],
    })

    render(
      <MemoryRouter initialEntries={[{ pathname: '/dashboard/profile' }]}>
        <NotificationsDrawer />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /review request/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/profile?tab=friends&section=requests')
  })

  it('opens the comments tab when a comment notification is clicked', async () => {
    const toggleDrawer = vi.fn()
    setNotificationStoreState({
      isDrawerOpen: true,
      toggleDrawer,
      notifications: [
        createNotification({
          id: 'comment-1',
          kind: 'profile_comment_created',
          metadata: { snippet: 'Loved your latest highlight reel!' },
        }),
      ],
    })

    render(
      <MemoryRouter>
        <NotificationsDrawer />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: /commented/i }))

    expect(toggleDrawer).toHaveBeenCalledWith(false)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/profile?tab=comments')
  })
})
