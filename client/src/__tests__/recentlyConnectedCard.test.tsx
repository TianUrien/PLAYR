import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecentlyConnectedCard from '@/components/RecentlyConnectedCard'
import type { ReferenceFriendOption } from '@/components/AddReferenceModal'

vi.mock('@/lib/analytics', () => ({
  trackReferenceModalOpen: vi.fn(),
  trackReferenceNudgeDismiss: vi.fn(),
}))

vi.mock('@/components/Avatar', () => ({
  default: ({ initials }: { initials?: string }) => <span data-testid="avatar">{initials}</span>,
}))

vi.mock('@/components/RoleBadge', () => ({
  default: ({ role }: { role?: string | null }) => (role ? <span>{role}</span> : null),
}))

const baseFriend: ReferenceFriendOption = {
  id: 'friend-1',
  fullName: 'Jamie Keeper',
  username: 'jamie',
  avatarUrl: null,
  role: 'coach',
  baseLocation: 'London',
  currentClub: 'HOCKIA FC',
  acceptedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('RecentlyConnectedCard', () => {
  it('renders nothing when the owner already has accepted references', () => {
    const { container } = render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={1}
        onAsk={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when there are no recent friends inside the window', () => {
    const stale: ReferenceFriendOption = {
      ...baseFriend,
      acceptedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const { container } = render(
      <RecentlyConnectedCard
        friendOptions={[stale]}
        acceptedReferenceCount={0}
        onAsk={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('promotes the most recent un-asked friend as the candidate', () => {
    render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={0}
        onAsk={vi.fn()}
      />,
    )
    expect(screen.getByText('Jamie Keeper')).toBeInTheDocument()
    expect(screen.getByText(/Ask Jamie to vouch/i)).toBeInTheDocument()
  })

  it('excludes friends already in pending or accepted references', () => {
    const { container } = render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={0}
        excludeIds={new Set(['friend-1'])}
        onAsk={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('fires onAsk with the friend id when the CTA is clicked', () => {
    const onAsk = vi.fn()
    render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={0}
        onAsk={onAsk}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /ask to vouch/i }))
    expect(onAsk).toHaveBeenCalledWith('friend-1')
  })

  it('hides the card after dismiss and remembers the dismissal across remount', () => {
    const { unmount } = render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={0}
        onAsk={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /dismiss this nudge/i }))
    expect(screen.queryByText('Jamie Keeper')).not.toBeInTheDocument()
    unmount()

    const { container } = render(
      <RecentlyConnectedCard
        friendOptions={[baseFriend]}
        acceptedReferenceCount={0}
        onAsk={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
