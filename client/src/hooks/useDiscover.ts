import { useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface DiscoverResult {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  role: string
  position: string | null
  secondary_position: string | null
  gender: string | null
  age: number | null
  nationality_country_id: number | null
  nationality2_country_id: number | null
  nationality_name: string | null
  nationality2_name: string | null
  flag_emoji: string | null
  flag_emoji2: string | null
  base_location: string | null
  base_country_name: string | null
  current_club: string | null
  current_world_club_id: string | null
  open_to_play: boolean
  open_to_coach: boolean
  open_to_opportunities: boolean
  accepted_reference_count: number
  career_entry_count: number
  accepted_friend_count: number
  last_active_at: string | null
}

export interface ParsedFilters {
  roles?: string[]
  positions?: string[]
  gender?: string
  min_age?: number
  max_age?: number
  eu_passport?: boolean
  nationalities?: string[]
  locations?: string[]
  availability?: string
  min_references?: number
  min_career_entries?: number
  leagues?: string[]
  countries?: string[]
  text_query?: string
  sort_by?: string
  summary?: string
}

export interface DiscoverResponse {
  success: boolean
  data: DiscoverResult[]
  total: number
  has_more: boolean
  parsed_filters: ParsedFilters | null
  summary: string | null
  ai_message: string
  error?: string
}

// ── Chat message types ──────────────────────────────────────────────────

export interface DiscoverChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  results?: DiscoverResult[]
  parsed_filters?: ParsedFilters | null
  total?: number
  timestamp: number
  status: 'sending' | 'complete' | 'error'
  error?: string
}

interface HistoryTurn {
  role: 'user' | 'assistant'
  content: string
}

// ── Conversational chat hook ────────────────────────────────────────────

export function useDiscoverChat() {
  const [messages, setMessages] = useState<DiscoverChatMessage[]>([])
  const [isPending, setIsPending] = useState(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const sendMessage = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed || isPending) return

    const userMsg: DiscoverChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
      status: 'complete',
    }

    const assistantId = crypto.randomUUID()
    const assistantPlaceholder: DiscoverChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'sending',
    }

    setMessages(prev => [...prev, userMsg, assistantPlaceholder])
    setIsPending(true)

    // Build history from completed messages (last 10 turns)
    const history: HistoryTurn[] = messagesRef.current
      .filter(m => m.status === 'complete')
      .map(m => ({ role: m.role, content: m.content }))
      .slice(-10)

    try {
      const { data, error } = await supabase.functions.invoke('nl-search', {
        body: { query: trimmed, history },
      })

      if (error) throw error

      const result = data as DiscoverResponse
      if (!result.success) {
        throw new Error(result.error || 'Search failed')
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: result.ai_message,
                results: result.data,
                parsed_filters: result.parsed_filters,
                total: result.total,
                status: 'complete' as const,
              }
            : m
        )
      )
    } catch (err) {
      logger.error('[useDiscoverChat] Error:', err)
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: 'Something went wrong. Please try again.',
                status: 'error' as const,
                error: err instanceof Error ? err.message : 'Unknown error',
              }
            : m
        )
      )
    } finally {
      setIsPending(false)
    }
  }, [isPending])

  const clearChat = useCallback(() => {
    setMessages([])
    setIsPending(false)
  }, [])

  return { messages, sendMessage, clearChat, isPending }
}
