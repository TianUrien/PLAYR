import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ConversationList from '@/components/ConversationList'
import ChatWindow from '@/components/ChatWindow'
import { vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  SUPABASE_URL: 'https://supabase.test',
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  }
}))

const mockUseChat = vi.fn()
const mockUseMediaQuery = vi.fn(() => false)
const mockUseSafeArea = vi.fn()
const scrollToBottom = vi.fn()
const mockScrollController = {
  scrollContainerRef: { current: document.createElement('div') as HTMLDivElement },
  isAutoScrollingRef: { current: false },
  isViewerAtBottom: () => true,
  scrollToBottom
}

vi.mock('@/hooks/useChat', () => ({
  useChat: (options: unknown) => mockUseChat(options)
}))

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockUseMediaQuery()
}))

vi.mock('@/hooks/useSafeArea', () => ({
  useSafeArea: () => mockUseSafeArea()
}))

vi.mock('@/hooks/useChatScrollController', () => ({
  useChatScrollController: () => mockScrollController
}))

type ConversationListConversation = Parameters<typeof ConversationList>[0]['conversations'][number]
type ChatConversation = Parameters<typeof ChatWindow>[0]['conversation']

const listConversationBase: ConversationListConversation = {
  id: 'conv-1',
  participant_one_id: 'user-1',
  participant_two_id: 'user-2',
  created_at: new Date('2024-01-01').toISOString(),
  updated_at: new Date('2024-01-01').toISOString(),
  last_message_at: new Date('2024-01-01').toISOString(),
  otherParticipant: {
    id: 'user-2',
    full_name: 'Alex Morgan',
    username: 'alex',
    avatar_url: null,
    role: 'player'
  },
  lastMessage: {
    content: 'Ready for training?',
    sent_at: new Date('2024-01-01').toISOString(),
    sender_id: 'user-2'
  },
  unreadCount: 1
}

const user = userEvent.setup()

const resolvedChatState = {
  messages: [
    {
      id: 'msg-1',
      conversation_id: 'conv-1',
      sender_id: 'user-2',
      content: 'Welcome back',
      sent_at: new Date('2024-01-01').toISOString(),
      read_at: null,
      created_at: new Date('2024-01-01').toISOString(),
      updated_at: new Date('2024-01-01').toISOString()
    },
    {
      id: 'msg-2',
      conversation_id: 'conv-1',
      sender_id: 'viewer-1',
      content: 'See you soon',
      sent_at: new Date('2024-01-02').toISOString(),
      read_at: null,
      created_at: new Date('2024-01-02').toISOString(),
      updated_at: new Date('2024-01-02').toISOString()
    }
  ],
  loading: false,
  sending: false,
  newMessage: '',
  setNewMessage: vi.fn(),
  hasMoreMessages: false,
  isLoadingMore: false,
  sendMessage: vi.fn(),
  loadOlderMessages: vi.fn(),
  queueReadReceipt: vi.fn(),
  markConversationAsRead: vi.fn()
}

beforeEach(() => {
  mockUseChat.mockReturnValue(resolvedChatState)
  mockUseMediaQuery.mockReturnValue(false)
  scrollToBottom.mockClear()
  const container = document.createElement('div')
  document.body.appendChild(container)
  mockScrollController.scrollContainerRef.current = container
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

const chatConversationBase: ChatConversation = {
  id: 'chat-1',
  participant_one_id: 'viewer-1',
  participant_two_id: 'user-2',
  created_at: new Date('2024-02-01').toISOString(),
  updated_at: new Date('2024-02-01').toISOString(),
  last_message_at: new Date('2024-02-01').toISOString(),
  otherParticipant: {
    id: 'user-2',
    full_name: 'Alex Morgan',
    username: 'alex',
    avatar_url: null,
    role: 'player'
  }
}

function renderChatWindow(overrides?: Partial<ChatConversation>) {
  const conversation = { ...chatConversationBase, ...overrides }
  return render(
    <MemoryRouter>
      <ChatWindow
        conversation={conversation}
        currentUserId="viewer-1"
        onBack={vi.fn()}
        onConversationCreated={vi.fn()}
      />
    </MemoryRouter>
  )
}

describe('Messages flows', () => {
  it('keeps the conversation list visible when navigating back from a chat', async () => {
    const conversations = [
      listConversationBase,
      {
        ...listConversationBase,
        id: 'conv-2',
        otherParticipant: {
          ...listConversationBase.otherParticipant!,
          id: 'user-3',
          full_name: 'Jordan Pickford',
          username: 'jordan'
        },
        lastMessage: {
          content: 'Training complete',
          sent_at: new Date('2024-01-03').toISOString(),
          sender_id: 'user-3'
        }
      }
    ]

    const handleSelect = vi.fn()
    const { rerender } = render(
      <ConversationList
        conversations={conversations}
        selectedConversationId="conv-2"
        onSelectConversation={handleSelect}
        currentUserId="viewer-1"
      />
    )

    expect(screen.getByText('Alex Morgan')).toBeInTheDocument()
    expect(screen.getByText('Jordan Pickford')).toBeInTheDocument()

    await user.click(screen.getByText('Alex Morgan'))
    expect(handleSelect).toHaveBeenCalledWith('conv-1')

    rerender(
      <ConversationList
        conversations={conversations}
        selectedConversationId={null}
        onSelectConversation={handleSelect}
        currentUserId="viewer-1"
      />
    )

    expect(screen.getByText('Alex Morgan')).toBeInTheDocument()
    expect(screen.getByText('Jordan Pickford')).toBeInTheDocument()
  })

  it('scrolls to the latest message when a chat opens', async () => {
    renderChatWindow()

    await waitFor(() => {
      expect(scrollToBottom).toHaveBeenCalled()
    })

    scrollToBottom.mockClear()

    renderChatWindow({ id: 'conv-9' })
    await waitFor(() => {
      expect(scrollToBottom).toHaveBeenCalled()
    })
  })

  it('applies a sticky header on mobile', async () => {
    mockUseMediaQuery.mockReturnValue(true)
    const { getByLabelText } = renderChatWindow()

    const backButton = getByLabelText('Back to conversations')
    const header = backButton.closest('div')
    expect(header).not.toBeNull()
    expect(header).toHaveClass('fixed')
  })
})
