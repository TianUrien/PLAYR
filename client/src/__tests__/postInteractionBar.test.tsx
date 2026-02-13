import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const user = userEvent.setup()

const authState = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  profile: { role: 'player' } as { role: string } | null,
}))

vi.mock('@/lib/auth', () => ({
  useAuthStore: () => authState,
}))

// Mock SharePostSheet to avoid Supabase calls in unit tests
vi.mock('@/components/home/SharePostSheet', () => ({
  SharePostSheet: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="share-post-sheet">
        <button type="button" onClick={onClose}>Close share sheet</button>
      </div>
    ) : null,
}))

import { PostInteractionBar } from '@/components/home/PostInteractionBar'

const defaultProps = {
  postId: 'post-1',
  likeCount: 5,
  commentCount: 3,
  hasLiked: false,
  onToggleLike: vi.fn().mockResolvedValue(undefined),
  onToggleComments: vi.fn(),
  showComments: false,
  authorId: 'author-1',
  authorName: 'Test Author',
  authorAvatar: null as string | null,
  authorRole: 'player' as const,
  content: 'Test post content',
  thumbnailUrl: null as string | null,
}

// Helper: action buttons use exact text "Like", "Comment", "Share"
// The counts row also has buttons with "3 comments" text, so we need exact names
function getLikeActionButton() {
  return screen.getByRole('button', { name: 'Like' })
}

function getCommentActionButton() {
  return screen.getByRole('button', { name: 'Comment' })
}

function getShareActionButton() {
  return screen.getByRole('button', { name: 'Share' })
}

describe('PostInteractionBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'user-1' }
    authState.profile = { role: 'player' }
  })

  it('renders like, comment, and share buttons', () => {
    render(<PostInteractionBar {...defaultProps} />)

    expect(getLikeActionButton()).toBeInTheDocument()
    expect(getCommentActionButton()).toBeInTheDocument()
    expect(getShareActionButton()).toBeInTheDocument()
  })

  it('shows counts when > 0', () => {
    render(<PostInteractionBar {...defaultProps} />)

    expect(screen.getByText('5 likes')).toBeInTheDocument()
    expect(screen.getByText('3 comments')).toBeInTheDocument()
  })

  it('shows singular when count is 1', () => {
    render(<PostInteractionBar {...defaultProps} likeCount={1} commentCount={1} />)

    expect(screen.getByText('1 like')).toBeInTheDocument()
    expect(screen.getByText('1 comment')).toBeInTheDocument()
  })

  it('hides counts row when all counts are 0', () => {
    render(<PostInteractionBar {...defaultProps} likeCount={0} commentCount={0} />)

    // No count text should appear
    expect(screen.queryByText(/\d+ likes?/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\d+ comments?/)).not.toBeInTheDocument()

    // But the action buttons should still be there
    expect(getLikeActionButton()).toBeInTheDocument()
    expect(getCommentActionButton()).toBeInTheDocument()
  })

  it('calls onToggleLike when Like is clicked', async () => {
    render(<PostInteractionBar {...defaultProps} />)

    await user.click(getLikeActionButton())

    await waitFor(() => {
      expect(defaultProps.onToggleLike).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onToggleComments when Comment is clicked', async () => {
    render(<PostInteractionBar {...defaultProps} />)

    await user.click(getCommentActionButton())

    expect(defaultProps.onToggleComments).toHaveBeenCalledTimes(1)
  })

  it('disables Like button when user is not logged in', () => {
    authState.user = null
    render(<PostInteractionBar {...defaultProps} />)

    expect(getLikeActionButton()).toBeDisabled()
  })

  it('opens share sheet when Share is clicked', async () => {
    render(<PostInteractionBar {...defaultProps} />)

    // Share sheet should not be visible initially
    expect(screen.queryByTestId('share-post-sheet')).not.toBeInTheDocument()

    // Click Share button
    await user.click(getShareActionButton())

    // Share sheet should open
    await waitFor(() => {
      expect(screen.getByTestId('share-post-sheet')).toBeInTheDocument()
    })
  })

  it('closes share sheet when onClose is called', async () => {
    render(<PostInteractionBar {...defaultProps} />)

    // Open the share sheet
    await user.click(getShareActionButton())
    expect(screen.getByTestId('share-post-sheet')).toBeInTheDocument()

    // Close it
    await user.click(screen.getByRole('button', { name: 'Close share sheet' }))

    await waitFor(() => {
      expect(screen.queryByTestId('share-post-sheet')).not.toBeInTheDocument()
    })
  })
})
