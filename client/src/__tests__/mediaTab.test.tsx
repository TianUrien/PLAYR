import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import MediaTab from '@/components/MediaTab'

const user = userEvent.setup()

const addToast = vi.fn()
vi.mock('@/lib/toast', () => ({
  useToastStore: () => ({ addToast }),
}))

const profileMocks = vi.hoisted(() => ({
  invalidateProfile: vi.fn(),
}))

vi.mock('@/lib/profile', () => profileMocks)

type AuthStoreState = {
  user: { id: string } | null
  profile: {
    id: string
    role: string
    highlight_video_url: string | null
  } | null
}

const authState: AuthStoreState = {
  user: { id: 'user-1' },
  profile: {
    id: 'user-1',
    role: 'player',
    highlight_video_url: 'https://youtu.be/abc123',
  },
}

const setAuthState = (overrides: Partial<AuthStoreState>) => {
  Object.assign(authState, overrides)
}

vi.mock('@/lib/auth', () => ({
  useAuthStore: () => authState,
}))

const galleryManagerProps: Array<Record<string, unknown>> = []
vi.mock('@/components/GalleryManager', () => ({
  default: (props: Record<string, unknown>) => {
    galleryManagerProps.push(props)
    return <div data-testid="gallery-manager" />
  },
}))

vi.mock('@/components/AddVideoLinkModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="video-modal">Modal</div> : null),
}))

vi.mock('@/components/ConfirmActionModal', () => ({
  default: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) => (
    isOpen ? (
      <div data-testid="confirm-modal">
        <button type="button" onClick={onConfirm}>
          Confirm
        </button>
      </div>
    ) : null
  ),
}))

vi.mock('@/components/Skeleton', () => ({
  default: () => <div data-testid="skeleton" />,
}))

const supabaseMocks = vi.hoisted(() => {
  const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))

  return { mockUpdate, mockUpdateEq }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      update: supabaseMocks.mockUpdate,
    })),
  },
}))

describe('MediaTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    galleryManagerProps.length = 0
    profileMocks.invalidateProfile.mockReset()
    supabaseMocks.mockUpdate.mockReset()
    supabaseMocks.mockUpdateEq.mockReset()
    supabaseMocks.mockUpdateEq.mockResolvedValue({ error: null })
    setAuthState({
      user: { id: 'user-1' },
      profile: {
        id: 'user-1',
        role: 'player',
        highlight_video_url: 'https://youtu.be/abc123',
      },
    })
  })

  it('renders the highlight video and exposes manage controls', async () => {
    const headerRender = vi.fn(() => <div data-testid="header-render" />)

    render(<MediaTab renderHeader={headerRender} />)

    await waitFor(() => {
      expect(headerRender).toHaveBeenCalled()
    })

    expect(screen.getByTitle('Highlight video player')).toBeInTheDocument()
    expect(headerRender).toHaveBeenLastCalledWith(
      expect.objectContaining({ canManageVideo: true, openManageModal: expect.any(Function) })
    )
    expect(screen.getByTestId('gallery-manager')).toBeInTheDocument()
  })

  it('shows the add video call-to-action when no highlight exists', async () => {
    setAuthState({
      profile: {
        id: 'user-1',
        role: 'player',
        highlight_video_url: null,
      },
    })

    render(<MediaTab />)

    expect(await screen.findByText('No Highlight Video Yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add video link/i })).toBeInTheDocument()
  })

  it('removes the highlight video when confirmed', async () => {
    render(<MediaTab />)

    const removeButton = await screen.findByRole('button', { name: 'Remove video' })
    await user.click(removeButton)

    const confirmButton = await screen.findByText('Confirm')
    await user.click(confirmButton)

    await waitFor(() => {
      expect(supabaseMocks.mockUpdate).toHaveBeenCalled()
      expect(supabaseMocks.mockUpdateEq).toHaveBeenCalledWith('id', 'user-1')
      expect(profileMocks.invalidateProfile).toHaveBeenCalledWith({ userId: 'user-1', reason: 'highlight-video-removed' })
    })
    expect(addToast).toHaveBeenCalledWith('Highlight video removed.', 'success')
  })
})
