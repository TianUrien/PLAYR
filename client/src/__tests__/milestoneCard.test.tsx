import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { MilestoneAchievedFeedItem } from '@/types/homeFeed'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('@/components', () => ({
  Avatar: ({ initials }: { initials?: string }) => <span data-testid="avatar">{initials}</span>,
  RoleBadge: ({ role }: { role?: string }) => <span data-testid="role-badge">{role}</span>,
}))

vi.mock('@/lib/utils', () => ({
  getTimeAgo: () => '2d ago',
}))

import { MilestoneCard } from '@/components/home/cards/MilestoneCard'

const baseMilestone: MilestoneAchievedFeedItem = {
  feed_item_id: 'ms-1',
  item_type: 'milestone_achieved',
  created_at: '2026-02-09T00:00:00Z',
  milestone_type: 'profile_100_percent',
  profile_id: 'p1',
  full_name: 'Test Player',
  avatar_url: null,
  role: 'player',
}

describe('MilestoneCard', () => {
  it('renders 100% completion milestone', () => {
    render(<MilestoneCard item={baseMilestone} />)

    expect(screen.getByText('Test Player')).toBeInTheDocument()
    expect(screen.getByText('completed their profile')).toBeInTheDocument()
  })

  it('renders first_video milestone', () => {
    render(
      <MilestoneCard
        item={{ ...baseMilestone, milestone_type: 'first_video' }}
      />
    )

    expect(screen.getByText('added a highlight video')).toBeInTheDocument()
  })

  it('renders first_gallery_image milestone', () => {
    render(
      <MilestoneCard
        item={{ ...baseMilestone, milestone_type: 'first_gallery_image' }}
      />
    )

    expect(screen.getByText('added gallery images')).toBeInTheDocument()
  })

  it('renders first_reference_received milestone', () => {
    render(
      <MilestoneCard
        item={{ ...baseMilestone, milestone_type: 'first_reference_received' }}
      />
    )

    expect(screen.getByText('received their first reference')).toBeInTheDocument()
  })

  it('links to correct profile path for player', () => {
    render(<MilestoneCard item={baseMilestone} />)

    const link = screen.getByText('Test Player').closest('a')
    expect(link).toHaveAttribute('href', '/players/id/p1')
  })

  it('links to correct profile path for club', () => {
    render(
      <MilestoneCard
        item={{ ...baseMilestone, role: 'club', full_name: 'Test FC' }}
      />
    )

    const link = screen.getByText('Test FC').closest('a')
    expect(link).toHaveAttribute('href', '/clubs/id/p1')
  })
})
