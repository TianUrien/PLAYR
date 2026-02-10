import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

// Mock dependencies before imports
vi.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://supabase.test',
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    }),
  },
}))

const navigateMock = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to, ...props }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/auth', () => ({
  useAuthStore: () => ({
    user: null,
    profile: null,
  }),
}))

vi.mock('@/hooks/useHomeFeed', () => ({
  useHomeFeed: () => ({
    items: [],
    isLoading: false,
    error: null,
    hasMore: false,
    loadMore: vi.fn(),
    updateItemLike: vi.fn(),
    removeItem: vi.fn(),
    prependItem: vi.fn(),
  }),
}))

vi.mock('@/components/home/PostComposer', () => ({
  PostComposer: () => null,
}))

vi.mock('@/components/home/FeedSkeleton', () => ({
  FeedSkeleton: () => <div data-testid="skeleton" />,
}))

import { HomeFeed } from '@/components/home/HomeFeed'

describe('HomeFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no items and not loading', () => {
    render(<HomeFeed />)

    expect(screen.getByText('No activity yet')).toBeInTheDocument()
    expect(
      screen.getByText(/when members join, post opportunities, or achieve milestones/i)
    ).toBeInTheDocument()
  })
})
