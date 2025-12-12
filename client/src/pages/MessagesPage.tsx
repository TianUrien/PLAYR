import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, MessageCircle } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import ConversationList from '@/components/ConversationList'
import ChatWindowV2 from '@/features/chat-v2/ChatWindowV2'
import type { ChatMessageEvent } from '@/types/chat'
import Header from '@/components/Header'
import { ConversationSkeleton } from '@/components/Skeleton'
import { requestCache } from '@/lib/requestCache'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { reportSupabaseError } from '@/lib/sentryHelpers'

interface ConversationDBRow {
  id: string
  last_message_at: string | null
  updated_at: string
  [key: string]: unknown
}

interface ConversationRpcRow {
  conversation_id: string
  other_participant_id: string
  other_participant_name: string | null
  other_participant_username: string | null
  other_participant_avatar: string | null
  other_participant_role: string | null
  last_message_content: string | null
  last_message_sent_at: string | null
  last_message_sender_id: string | null
  unread_count: number | null
  conversation_created_at: string
  conversation_updated_at: string
  conversation_last_message_at: string | null
  has_more?: boolean
}

const CONVERSATIONS_PAGE_SIZE = 25

const CONVERSATION_REALTIME_DEBOUNCE_MS = (() => {
  const env = import.meta.env ? (import.meta.env as Record<string, string | undefined>) : {}
  const raw = env.VITE_CONVERSATION_REALTIME_DEBOUNCE_MS
  const parsed = raw ? Number(raw) : NaN
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return 200
})()

interface Conversation {
  id: string
  participant_one_id: string
  participant_two_id: string
  created_at: string
  updated_at: string
  last_message_at: string | null
  otherParticipant?: {
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    role: 'player' | 'coach' | 'club'
  }
  lastMessage?: {
    content: string
    sent_at: string
    sender_id: string
  }
  unreadCount?: number
  isPending?: boolean
  sortTimestamp?: string | null
}

export default function MessagesPage() {
  const { user } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { conversationId: conversationIdParam } = useParams<{ conversationId?: string }>()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const conversationIdFromQuery = searchParams.get('conversation')
  const newConversationTargetId = searchParams.get('new')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingConversation, setPendingConversation] = useState<Conversation | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => {
    if (conversationIdParam) return conversationIdParam
    if (conversationIdFromQuery) return conversationIdFromQuery
    if (newConversationTargetId) return `pending-${newConversationTargetId}`
    return null
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreConversations, setHasMoreConversations] = useState(true)
  const [isFetchingMoreConversations, setIsFetchingMoreConversations] = useState(false)
  const [conversationCursor, setConversationCursor] = useState<{ lastMessageAt: string | null; conversationId: string | null } | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const realtimeRefreshTimeoutRef = useRef<number | null>(null)

  // Set selected conversation from URL parameter
  useEffect(() => {
    if (conversationIdParam) {
      setSelectedConversationId(conversationIdParam)
      return
    }

    if (conversationIdFromQuery) {
      setSelectedConversationId(conversationIdFromQuery)
      return
    }

    if (!newConversationTargetId) {
      setSelectedConversationId(null)
    }
  }, [conversationIdParam, conversationIdFromQuery, newConversationTargetId])

  const getConversationSortValue = useCallback((conversation: Conversation) => {
    return (
      conversation.sortTimestamp ||
      conversation.last_message_at ||
      conversation.created_at ||
      conversation.updated_at ||
      null
    )
  }, [])

  const mergeConversationLists = useCallback((existing: Conversation[], incoming: Conversation[]) => {
    const map = new Map<string, Conversation>()
    existing.forEach(conv => map.set(conv.id, conv))
    incoming.forEach(conv => map.set(conv.id, conv))

    return Array.from(map.values()).sort((a, b) => {
      const aValue = getConversationSortValue(a)
      const bValue = getConversationSortValue(b)

      if (!aValue && !bValue) return 0
      if (!aValue) return 1
      if (!bValue) return -1
      if (aValue === bValue) {
        return a.id < b.id ? 1 : -1
      }
      return aValue > bValue ? -1 : 1
    })
  }, [getConversationSortValue])

  const fetchConversations = useCallback(async (options?: {
    force?: boolean
    append?: boolean
    cursor?: { lastMessageAt: string | null; conversationId: string | null } | null
  }) => {
    if (!user?.id) return

    const safeLimit = CONVERSATIONS_PAGE_SIZE
    const cursor = options?.cursor ?? null
    const cacheKey = `conversations-${user.id}-${cursor?.lastMessageAt ?? 'root'}-${cursor?.conversationId ?? 'root'}`

    if (options?.append) {
      setIsFetchingMoreConversations(true)
    } else if (options?.force) {
      setHasMoreConversations(true)
      setConversationCursor(null)
    }

    await monitor.measure('fetch_conversations', async () => {
      if (options?.force) {
        requestCache.invalidate(cacheKey)
        logger.debug('Forcing conversations refresh', { cacheKey })
      }

      try {
        setError(null)
        const rows = await requestCache.dedupe(
          cacheKey,
          async () => {
            let data: ConversationRpcRow[] = []
            let lastError: unknown = null
            const maxAttempts = 3

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              try {
                Sentry.addBreadcrumb({
                  category: 'supabase',
                  message: 'fetch_conversations.rpc',
                  data: { userId: user.id, cursor },
                  level: 'info'
                })
                const result = await supabase.rpc('get_user_conversations', {
                  p_user_id: user.id,
                  p_limit: safeLimit,
                  p_cursor_last_message_at: cursor?.lastMessageAt ?? undefined,
                  p_cursor_conversation_id: cursor?.conversationId ?? undefined
                })

                if (result.error) throw result.error

                data = result.data ?? []
                lastError = null
                break
              } catch (err) {
                lastError = err
                if (attempt < maxAttempts - 1) {
                  await new Promise(resolve => setTimeout(resolve, 300 * Math.pow(2, attempt)))
                }
              }
            }

            if (lastError) throw lastError

            return data as ConversationRpcRow[] | null
          },
          60000
        )

        const safeRows = rows ?? []

        const normalized = safeRows.map((row: ConversationRpcRow) => {
          const sortTimestamp = row.conversation_last_message_at || row.conversation_created_at || row.conversation_updated_at || null
          return {
            id: row.conversation_id,
            participant_one_id: user.id,
            participant_two_id: row.other_participant_id,
            created_at: row.conversation_created_at,
            updated_at: row.conversation_updated_at,
            last_message_at: row.conversation_last_message_at,
            otherParticipant: row.other_participant_name
              ? {
                  id: row.other_participant_id,
                  full_name: row.other_participant_name,
                  username: row.other_participant_username,
                  avatar_url: row.other_participant_avatar,
                  role: row.other_participant_role as 'player' | 'coach' | 'club'
                }
              : undefined,
            lastMessage: row.last_message_content
              ? {
                  content: row.last_message_content,
                  sent_at: row.last_message_sent_at,
                  sender_id: row.last_message_sender_id
                }
              : undefined,
            unreadCount: Number(row.unread_count ?? 0),
            sortTimestamp,
            _has_more: Boolean(row.has_more)
          } as Conversation & { _has_more: boolean }
        })

        const hasMore = normalized.some(row => row._has_more)
        const sanitized = normalized.map(item => {
          const { _has_more, ...rest } = item
          void _has_more
          return rest
        })
        if (options?.append) {
          setConversations(prev => {
            const merged = mergeConversationLists(prev, sanitized)
            return merged
          })
        } else {
          setConversations(sanitized)
        }

        setHasMoreConversations(hasMore)

        const cursorSource = sanitized[sanitized.length - 1]
        setConversationCursor(
          cursorSource
            ? {
                lastMessageAt: getConversationSortValue(cursorSource),
                conversationId: cursorSource.id
              }
            : null
        )
      } catch (error) {
        logger.error('Error fetching conversations:', error)
        reportSupabaseError('messaging_list.fetch_conversations', error, {
          userId: user?.id ?? null,
          cursor
        }, {
          feature: 'messaging_list',
          operation: 'fetch_conversations'
        })
        setError('Failed to load conversations. Please try again.')
      } finally {
        if (options?.append) {
          setIsFetchingMoreConversations(false)
        }
        setLoading(false)
      }
    }, { userId: user.id })
  }, [getConversationSortValue, mergeConversationLists, user?.id])

  const scheduleRealtimeRefresh = useCallback(() => {
    if (typeof window === 'undefined') {
      void fetchConversations({ force: true })
      return
    }

    if (realtimeRefreshTimeoutRef.current !== null) {
      return
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null
      void fetchConversations({ force: true })
    }, CONVERSATION_REALTIME_DEBOUNCE_MS)
  }, [fetchConversations])

  useEffect(() => {
    if (user?.id) {
      // Force refresh on mount to ensure we have the latest conversations
      // This prevents stale data if the user received messages while on another page
      fetchConversations({ force: true })
    }
  }, [user?.id, fetchConversations]) // Fixed: Use user?.id instead of user object

  // Remove forced refresh on navigation - rely on real-time updates instead

  useEffect(() => {
    if (!user?.id) return

    const targetUserId = newConversationTargetId

    if (!targetUserId) {
      setPendingConversation(null)
      return
    }

    if (targetUserId === user.id) {
      logger.warn('Ignoring request to start conversation with self', { targetUserId })
      setPendingConversation(null)
      return
    }

    const existingConversation = conversations.find(
      (conv) =>
        (conv.participant_one_id === user.id && conv.participant_two_id === targetUserId) ||
        (conv.participant_two_id === user.id && conv.participant_one_id === targetUserId)
    )

    if (existingConversation) {
      setPendingConversation(null)
      setSelectedConversationId(existingConversation.id)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('conversation', existingConversation.id)
      nextParams.delete('new')
      const nextSearch = nextParams.toString()
      navigate(
        {
          pathname: `/messages/${existingConversation.id}`,
          search: nextSearch ? `?${nextSearch}` : ''
        },
        { replace: true }
      )
      return
    }

    if (
      pendingConversation &&
      ((pendingConversation.participant_one_id === user.id && pendingConversation.participant_two_id === targetUserId) ||
        (pendingConversation.participant_two_id === user.id && pendingConversation.participant_one_id === targetUserId))
    ) {
      setSelectedConversationId(pendingConversation.id)
      return
    }

    let isCancelled = false

    const loadPendingParticipant = async () => {
      try {
        Sentry.addBreadcrumb({
          category: 'supabase',
          message: 'load_pending_participant.profile',
          data: { targetUserId },
          level: 'info'
        })
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, avatar_url, role')
          .eq('id', targetUserId)
          .maybeSingle()

        if (isCancelled) return

        if (error || !data) {
          logger.error('Failed to load participant for pending conversation', { error, targetUserId })
          setPendingConversation(null)
          return
        }

        const pendingId = `pending-${targetUserId}`
        setPendingConversation({
          id: pendingId,
          participant_one_id: user.id,
          participant_two_id: targetUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message_at: null,
          otherParticipant: {
            id: data.id,
            full_name: data.full_name || '',
            username: data.username,
            avatar_url: data.avatar_url,
            role: ((data.role ?? 'player') as 'player' | 'coach' | 'club')
          },
          unreadCount: 0,
          isPending: true
        })
        setSelectedConversationId(pendingId)
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('new', targetUserId)
        nextParams.delete('conversation')
        const nextSearch = nextParams.toString()
        navigate(
          {
            pathname: `/messages/${pendingId}`,
            search: nextSearch ? `?${nextSearch}` : ''
          },
          { replace: true }
        )
      } catch (error) {
        if (isCancelled) return
        logger.error('Unexpected error loading pending conversation', { error, targetUserId })
        reportSupabaseError('messaging_list.load_pending_participant', error, {
          targetUserId
        }, {
          feature: 'messaging_list',
          operation: 'load_pending_participant'
        })
        setPendingConversation(null)
      }
    }

    loadPendingParticipant()

    return () => {
      isCancelled = true
    }
  }, [newConversationTargetId, user?.id, conversations, pendingConversation, navigate, searchParams])

  // Participant-scoped realtime: refresh whenever any conversation involving the user changes
  useEffect(() => {
    if (!user?.id) {
      return
    }

    const handleConversationChange = (payload: RealtimePostgresChangesPayload<ConversationDBRow>) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const newRecord = payload.new
        setConversations(prev => {
          const exists = prev.find(c => c.id === newRecord.id)
          if (exists) {
            return prev
              .map(c => (c.id === newRecord.id
                ? {
                    ...c,
                    last_message_at: newRecord.last_message_at,
                    updated_at: newRecord.updated_at
                  }
                : c))
              .sort((a, b) => new Date(b.last_message_at || b.updated_at).getTime() - new Date(a.last_message_at || a.updated_at).getTime())
          }
          return prev
        })

        scheduleRealtimeRefresh()
      }
    }

    const channel = supabase
      .channel(`conversation-events:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `participant_one_id=eq.${user.id}`
        },
        handleConversationChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `participant_two_id=eq.${user.id}`
        },
        handleConversationChange
      )
      .subscribe()

    return () => {
      if (typeof window !== 'undefined' && realtimeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(realtimeRefreshTimeoutRef.current)
        realtimeRefreshTimeoutRef.current = null
      }
      supabase.removeChannel(channel)
    }
  }, [fetchConversations, scheduleRealtimeRefresh, user?.id])

  const combinedConversations = useMemo(() => {
    if (!pendingConversation) return conversations

    const duplicateExists = conversations.some(
      (conv) =>
        (conv.participant_one_id === pendingConversation.participant_one_id &&
          conv.participant_two_id === pendingConversation.participant_two_id) ||
        (conv.participant_one_id === pendingConversation.participant_two_id &&
          conv.participant_two_id === pendingConversation.participant_one_id)
    )

    if (duplicateExists) {
      return conversations
    }

    return [pendingConversation, ...conversations]
  }, [conversations, pendingConversation])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filteredConversations = normalizedQuery
    ? combinedConversations.filter((conv) => {
        const name = conv.otherParticipant?.full_name?.toLowerCase() ?? ''
        return name.includes(normalizedQuery)
      })
    : combinedConversations

  const selectedConversation = combinedConversations.find((conv) => conv.id === selectedConversationId)
  const hasActiveConversation = Boolean(selectedConversationId)
  const shouldHideGlobalHeader = Boolean(isMobile && hasActiveConversation)
  const conversationListKey = shouldHideGlobalHeader ? 'immersive-hidden' : 'list-visible'
  const shouldLockBodyScroll = shouldHideGlobalHeader
  useBodyScrollLock(shouldLockBodyScroll)

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      const selected = combinedConversations.find((conv) => conv.id === conversationId)

      setSelectedConversationId(conversationId)
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? {
                ...conv,
                unreadCount: 0
              }
            : conv
        )
      )

      const nextParams = new URLSearchParams(searchParams)

      if (selected?.isPending) {
        const targetId =
          selected.participant_one_id === user?.id
            ? selected.participant_two_id
            : selected.participant_one_id

        if (targetId) {
          nextParams.set('new', targetId)
        }
        nextParams.delete('conversation')
      } else {
        nextParams.set('conversation', conversationId)
        nextParams.delete('new')
      }

      const nextSearch = nextParams.toString()
      navigate({
        pathname: `/messages/${conversationId}`,
        search: nextSearch ? `?${nextSearch}` : ''
      })
    },
    [combinedConversations, navigate, searchParams, user?.id]
  )

  const handleBackToList = useCallback(() => {
    setSelectedConversationId(null)
    setPendingConversation(null)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('conversation')
    nextParams.delete('new')
    const nextSearch = nextParams.toString()
    navigate({
      pathname: '/messages',
      search: nextSearch ? `?${nextSearch}` : ''
    })
  }, [navigate, searchParams])

  const handleConversationCreated = useCallback(
    (createdConversation: Conversation) => {
      setPendingConversation(null)
      setSelectedConversationId(createdConversation.id)

      // Optimistically add/update conversation in local state
      setConversations((prev) => {
        const existingIndex = prev.findIndex((conv) => conv.id === createdConversation.id)
        const normalizedConversation: Conversation = {
          ...createdConversation,
          last_message_at: createdConversation.last_message_at ?? createdConversation.updated_at,
          unreadCount: createdConversation.unreadCount ?? 0
        }

        if (existingIndex >= 0) {
          const next = [...prev]
          next[existingIndex] = {
            ...next[existingIndex],
            ...normalizedConversation
          }
          return next
        }

        return [normalizedConversation, ...prev]
      })

      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('conversation', createdConversation.id)
      nextParams.delete('new')
      const nextSearch = nextParams.toString()
      navigate({
        pathname: `/messages/${createdConversation.id}`,
        search: nextSearch ? `?${nextSearch}` : ''
      })
      // Don't force refresh - real-time subscription will handle updates
    },
    [navigate, searchParams]
  )

  const handleConversationRead = useCallback(
    (conversationId: string) => {
      setConversations(prev =>
        prev.map(conv =>
          conv.id === conversationId
            ? {
                ...conv,
                unreadCount: 0
              }
            : conv
        )
      )

      if (user?.id) {
        requestCache.invalidate(`conversations-${user.id}`)
      }
    },
    [user?.id]
  )

  const handleConversationMessageEvent = useCallback(
    (event: ChatMessageEvent) => {
      if (event.type === 'sent' || event.type === 'received') {
        setConversations(prev => {
          const existing = prev.find(conv => conv.id === event.conversationId)
          if (!existing) {
            return prev
          }

          const isActiveConversation = selectedConversationId === event.conversationId
          const updatedConversation: Conversation = {
            ...existing,
            lastMessage: {
              content: event.message.content,
              sent_at: event.message.sent_at,
              sender_id: event.message.sender_id
            },
            last_message_at: event.message.sent_at,
            unreadCount:
              event.type === 'received'
                ? isActiveConversation
                  ? 0
                  : (existing.unreadCount ?? 0) + 1
                : existing.unreadCount ?? 0
          }

          const others = prev.filter(conv => conv.id !== event.conversationId)
          return [updatedConversation, ...others]
        })
      } else if (event.type === 'read') {
        setConversations(prev =>
          prev.map(conv =>
            conv.id === event.conversationId
              ? { ...conv, unreadCount: 0 }
              : conv
          )
        )
      }
    },
    [selectedConversationId]
  )

  const handleLoadMoreConversations = useCallback(() => {
    if (!hasMoreConversations || isFetchingMoreConversations) {
      return
    }

    fetchConversations({ append: true, cursor: conversationCursor })
  }, [hasMoreConversations, isFetchingMoreConversations, fetchConversations, conversationCursor])

  const isPendingConversation = selectedConversationId?.startsWith('pending-') ?? false
  const isValidConversationId = selectedConversationId
    ? /^[0-9a-fA-F-]{36}$/.test(selectedConversationId)
    : false

  useEffect(() => {
    if (!user?.id || !selectedConversationId || isPendingConversation || !isValidConversationId) {
      return
    }

    const alreadyLoaded = combinedConversations.some(conv => conv.id === selectedConversationId)
    if (alreadyLoaded) {
      return
    }

    let cancelled = false

    const hydrateConversation = async () => {
      try {
        Sentry.addBreadcrumb({
          category: 'supabase',
          message: 'hydrate_conversation.lookup',
          data: { selectedConversationId },
          level: 'info'
        })
        const { data: conversationRow, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', selectedConversationId)
          .maybeSingle()

        if (cancelled) return

        if (error || !conversationRow) {
          logger.warn('Conversation id from URL not found', { selectedConversationId, error })
          setSelectedConversationId(null)
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('conversation')
          const nextSearch = nextParams.toString()
          navigate(
            {
              pathname: '/messages',
              search: nextSearch ? `?${nextSearch}` : ''
            },
            { replace: true }
          )
          return
        }

        if (conversationRow.participant_one_id !== user.id && conversationRow.participant_two_id !== user.id) {
          logger.warn('Conversation does not belong to current user', { selectedConversationId })
          setSelectedConversationId(null)
          const nextParams = new URLSearchParams(searchParams)
          nextParams.delete('conversation')
          const nextSearch = nextParams.toString()
          navigate(
            {
              pathname: '/messages',
              search: nextSearch ? `?${nextSearch}` : ''
            },
            { replace: true }
          )
          return
        }

        const otherParticipantId =
          conversationRow.participant_one_id === user.id
            ? conversationRow.participant_two_id
            : conversationRow.participant_one_id

        const [profileResult, lastMessageResult, unreadCountResult] = await Promise.all([
          (async () => {
            Sentry.addBreadcrumb({
              category: 'supabase',
              message: 'hydrate_conversation.profile',
              data: { otherParticipantId },
              level: 'info'
            })
            return supabase
              .from('profiles')
              .select('id, full_name, username, avatar_url, role')
              .eq('id', otherParticipantId)
              .maybeSingle()
          })(),
          (async () => {
            Sentry.addBreadcrumb({
              category: 'supabase',
              message: 'hydrate_conversation.last_message',
              data: { selectedConversationId },
              level: 'info'
            })
            return supabase
              .from('messages')
              .select('content, sent_at, sender_id')
              .eq('conversation_id', conversationRow.id)
              .order('sent_at', { ascending: false })
              .limit(1)
          })(),
          (async () => {
            Sentry.addBreadcrumb({
              category: 'supabase',
              message: 'hydrate_conversation.unread_count',
              data: { selectedConversationId },
              level: 'info'
            })
            return supabase
              .from('messages')
              .select('id', { count: 'exact', head: true })
              .eq('conversation_id', conversationRow.id)
              .neq('sender_id', user.id)
              .is('read_at', null)
          })()
        ])

        if (cancelled) return

        const profileData = profileResult.data
        const lastMessageData = (lastMessageResult.data && lastMessageResult.data[0]) || null
        const unreadCount = unreadCountResult.count ?? 0

        const hydratedConversation: Conversation = {
          id: conversationRow.id,
          participant_one_id: conversationRow.participant_one_id,
          participant_two_id: conversationRow.participant_two_id,
          created_at: conversationRow.created_at,
          updated_at: conversationRow.updated_at,
          last_message_at: conversationRow.last_message_at,
          otherParticipant: profileData
            ? {
                id: profileData.id,
                full_name: profileData.full_name || '',
                username: profileData.username,
                avatar_url: profileData.avatar_url,
                role: (profileData.role ?? 'player') as 'player' | 'coach' | 'club'
              }
            : undefined,
          lastMessage: lastMessageData
            ? {
                content: lastMessageData.content,
                sent_at: lastMessageData.sent_at,
                sender_id: lastMessageData.sender_id
              }
            : undefined,
          unreadCount
        }

        setConversations(prev => {
          const withoutCurrent = prev.filter(conv => conv.id !== hydratedConversation.id)
          return [hydratedConversation, ...withoutCurrent]
        })
      } catch (error) {
        if (cancelled) return
        logger.error('Failed to hydrate conversation from URL', { error, selectedConversationId })
        reportSupabaseError('messaging_list.hydrate_conversation', error, {
          selectedConversationId,
          isPendingConversation,
          isValidConversationId
        }, {
          feature: 'messaging_list',
          operation: 'hydrate_conversation'
        })
      }
    }

    hydrateConversation()

    return () => {
      cancelled = true
    }
  }, [combinedConversations, navigate, searchParams, selectedConversationId, user?.id, isPendingConversation, isValidConversationId])

  const rootContainerClasses = isMobile
    ? 'flex flex-1 min-h-0 flex-col bg-white'
    : 'flex flex-1 min-h-0 flex-col overflow-hidden bg-gray-50'

  const mainPaddingClasses = isMobile
    ? shouldHideGlobalHeader
      ? 'mx-auto w-full max-w-7xl px-0 md:px-6'
      : 'mx-auto w-full max-w-7xl px-4 pb-4 pt-[calc(var(--app-header-offset,0px)+1rem)] md:px-6'
    : 'mx-auto w-full max-w-7xl px-4 pb-12 pt-[calc(var(--app-header-offset,0px)+1.5rem)] md:px-6'

  const containerClasses = shouldHideGlobalHeader
    ? 'flex min-h-0 flex-1 flex-col bg-white md:flex-row md:overflow-hidden'
    : isMobile
      ? 'flex min-h-0 flex-1 flex-col bg-white md:flex-row md:overflow-hidden'
      : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm md:flex-row'

  if (loading) {
    return (
      <div className={rootContainerClasses}>
        {!shouldHideGlobalHeader && <Header />}
        <main className={`${mainPaddingClasses} flex min-h-0 flex-1 flex-col overflow-hidden`}>
          <div className={containerClasses}>
            <div className="flex min-h-0 flex-1">
              <div
                className={`flex w-full flex-shrink-0 flex-col border-b border-gray-100 md:w-96 md:border-b-0 md:border-r ${
                  hasActiveConversation ? 'hidden md:flex' : 'flex'
                }`}
              >
                <div className="p-4 border-b border-gray-200">
                  <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-4"></div>
                  <div className="h-10 bg-gray-100 rounded-lg animate-pulse"></div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {[...Array(8)].map((_, i) => (
                    <ConversationSkeleton key={i} />
                  ))}
                </div>
              </div>
              <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse mx-auto mb-4"></div>
                  <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={rootContainerClasses}>
      {!shouldHideGlobalHeader && <Header />}

      <main className={`${mainPaddingClasses} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className={containerClasses}>
          <div className="flex min-h-0 flex-1">
            {/* Left Column - Conversations List */}
            <div
              className={`flex w-full flex-shrink-0 flex-col border-b border-gray-100 md:w-96 md:border-b-0 md:border-r ${
                hasActiveConversation ? 'hidden md:flex' : 'flex'
              }`}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-200">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Messages</h1>
                
                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Conversations List */}
              <div className={`flex-1 min-h-0 ${isMobile ? 'border-t border-gray-100 bg-white/95' : ''}`}>
                {error ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                      <MessageCircle className="w-8 h-8 text-red-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      {error}
                    </p>
                    <button
                      onClick={() => fetchConversations({ force: true })}
                      className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                    >
                      Try again
                    </button>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <MessageCircle className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Start a conversation from a player or club profile
                    </p>
                    <button
                      onClick={() => fetchConversations({ force: true })}
                      className="text-sm font-medium text-purple-600 hover:text-purple-700"
                    >
                      Refresh list
                    </button>
                  </div>
                ) : (
                  <>
                    <ConversationList
                      key={conversationListKey}
                      conversations={filteredConversations}
                      selectedConversationId={selectedConversationId}
                      onSelectConversation={handleSelectConversation}
                      currentUserId={user?.id || ''}
                      variant={isMobile ? 'compact' : 'default'}
                    />
                    {hasMoreConversations && !searchQuery && (
                      <div className="border-t border-gray-100 bg-white/90 backdrop-blur-sm p-4">
                        <button
                          type="button"
                          onClick={handleLoadMoreConversations}
                          disabled={isFetchingMoreConversations}
                          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                        >
                          {isFetchingMoreConversations ? 'Loading more conversations...' : 'Load older conversations'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right Column - Chat Window */}
            <div className={`flex min-h-0 flex-1 flex-col ${hasActiveConversation ? 'flex' : 'hidden md:flex'}`}>
              {selectedConversation ? (
                <ChatWindowV2
                  conversation={selectedConversation}
                  currentUserId={user?.id || ''}
                  onBack={handleBackToList}
                  onMessageSent={handleConversationMessageEvent}
                  onConversationCreated={handleConversationCreated}
                  onConversationRead={handleConversationRead}
                  isImmersiveMobile={shouldHideGlobalHeader}
                />
              ) : selectedConversationId ? (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gray-50 p-8 text-center">
                  <div className="w-16 h-16 animate-spin rounded-full border-2 border-purple-200 border-t-transparent mb-4"></div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading conversation...</h3>
                  <p className="text-gray-600">Hang tight while we fetch the latest messages.</p>
                  <button
                    onClick={handleBackToList}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                  >
                    Back to conversations
                  </button>
                </div>
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gray-50 p-8 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <MessageCircle className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a conversation</h3>
                  <p className="text-gray-600 mb-6">
                    Choose a conversation from the list to start messaging
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
