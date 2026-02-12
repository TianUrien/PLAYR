import { vi, describe, it, expect, beforeEach } from 'vitest'

// Build per-test Supabase mocks with fresh chainable methods
function createMockChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    or: vi.fn(),
    insert: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  // Self-referencing chain
  chain.select.mockReturnValue(chain)
  chain.or.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  return chain
}

let mockFrom: ReturnType<typeof vi.fn>

vi.mock('@/lib/supabase', () => ({
  supabase: { get from() { return mockFrom } },
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { sendSharedPostMessage } from '@/lib/sharePost'
import type { SharedPostMetadata } from '@/types/chat'

const postData: SharedPostMetadata = {
  type: 'shared_post',
  post_id: 'post-123',
  author_id: 'author-1',
  author_name: 'Test Author',
  author_avatar: null,
  author_role: 'player',
  content_preview: 'Hello world...',
  thumbnail_url: null,
}

describe('sendSharedPostMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds existing conversation and inserts message', async () => {
    const convChain = createMockChain()
    convChain.maybeSingle.mockResolvedValue({ data: { id: 'conv-existing' }, error: null })

    const msgInsert = vi.fn().mockResolvedValue({ error: null })

    mockFrom = vi.fn((table: string) =>
      table === 'conversations' ? convChain : { insert: msgInsert },
    )

    const result = await sendSharedPostMessage('user-1', 'user-2', postData)

    expect(result.success).toBe(true)
    expect(msgInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-existing',
        sender_id: 'user-1',
        content: 'Shared a post',
        metadata: postData,
      }),
    )
  })

  it('creates new conversation if none exists', async () => {
    const insertSingle = vi.fn().mockResolvedValue({ data: { id: 'conv-new' }, error: null })
    const insertSelect = vi.fn().mockReturnValue({ single: insertSingle })
    const convInsert = vi.fn().mockReturnValue({ select: insertSelect })

    const convChain = createMockChain()
    convChain.maybeSingle.mockResolvedValue({ data: null, error: null })
    convChain.insert = convInsert

    const msgInsert = vi.fn().mockResolvedValue({ error: null })

    mockFrom = vi.fn((table: string) =>
      table === 'conversations' ? convChain : { insert: msgInsert },
    )

    const result = await sendSharedPostMessage('user-1', 'user-2', postData)

    expect(result.success).toBe(true)
    expect(convInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        participant_one_id: 'user-1',
        participant_two_id: 'user-2',
      }),
    )
    expect(msgInsert).toHaveBeenCalled()
  })

  it('returns error when find conversation fails', async () => {
    const convChain = createMockChain()
    convChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    mockFrom = vi.fn(() => convChain)

    const result = await sendSharedPostMessage('user-1', 'user-2', postData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to find conversation')
  })

  it('returns error when message insert fails', async () => {
    const convChain = createMockChain()
    convChain.maybeSingle.mockResolvedValue({ data: { id: 'conv-existing' }, error: null })

    const msgInsert = vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } })

    mockFrom = vi.fn((table: string) =>
      table === 'conversations' ? convChain : { insert: msgInsert },
    )

    const result = await sendSharedPostMessage('user-1', 'user-2', postData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to send message')
  })

  it('handles unexpected errors gracefully', async () => {
    const convChain = createMockChain()
    convChain.maybeSingle.mockRejectedValue(new Error('Network error'))

    mockFrom = vi.fn(() => convChain)

    const result = await sendSharedPostMessage('user-1', 'user-2', postData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Something went wrong')
  })
})
