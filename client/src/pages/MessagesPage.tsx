import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, MessageCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useSearchParams } from 'react-router-dom'
import ConversationList from '@/components/ConversationList'
import ChatWindow, { type ChatMessageEvent } from '@/components/ChatWindow'
import Header from '@/components/Header'
import { ConversationSkeleton } from '@/components/Skeleton'
import { requestCache } from '@/lib/requestCache'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'

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
}

export default function MessagesPage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [pendingConversation, setPendingConversation] = useState<Conversation | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const messagingMobileV2Enabled = import.meta.env.VITE_MESSAGING_MOBILE_V2 === 'true'
  const { adjust: adjustUnreadCount, refresh: refreshUnreadCount } = useUnreadMessages()

  // Set selected conversation from URL parameter
  useEffect(() => {
    const conversationId = searchParams.get('conversation')
    if (conversationId) {
      setSelectedConversationId(conversationId)
      return
    }

    const pendingUserId = searchParams.get('new')
    if (!pendingUserId) {
      setSelectedConversationId(null)
    }
  }, [searchParams])

  const fetchConversations = useCallback(async (options?: { force?: boolean }) => {
    if (!user?.id) return

    await monitor.measure('fetch_conversations', async () => {
      const cacheKey = `conversations-${user.id}`
      if (options?.force) {
        requestCache.invalidate(cacheKey)
        logger.debug('Forcing conversations refresh due to direct navigation', { cacheKey })
      }
      
      try {
        const enrichedConversations = await requestCache.dedupe(
          cacheKey,
          async () => {
            // Use optimized stored procedure (single query, ~50-150ms)
            const { data, error } = await supabase
              .rpc('get_user_conversations', {
                p_user_id: user.id,
                p_limit: 50
              })

            if (error) throw error

            // Transform RPC result to expected Conversation format
            return (data || []).map(row => ({
              id: row.conversation_id,
              participant_one_id: user.id,
              participant_two_id: row.other_participant_id,
              created_at: row.conversation_created_at,
              updated_at: row.conversation_updated_at,
              last_message_at: row.conversation_last_message_at,
              otherParticipant: row.other_participant_name ? {
                id: row.other_participant_id,
                full_name: row.other_participant_name,
                username: row.other_participant_username,
                avatar_url: row.other_participant_avatar,
                role: row.other_participant_role as 'player' | 'coach' | 'club'
              } : undefined,
              lastMessage: row.last_message_content ? {
                content: row.last_message_content,
                sent_at: row.last_message_sent_at,
                sender_id: row.last_message_sender_id
              } : undefined,
              unreadCount: Number(row.unread_count) || 0
            }))
          },
          60000 // Cache for 60 seconds (increased from 15s)
        )

        setConversations(enrichedConversations)
      } catch (error) {
        logger.error('Error fetching conversations:', error)
      } finally {
        setLoading(false)
      }
    }, { userId: user.id })
  }, [user?.id]) // Fixed: Only depend on user.id to prevent unnecessary recreations

  useEffect(() => {
    if (user?.id) {
      fetchConversations()
    }
  }, [user?.id, fetchConversations]) // Fixed: Use user?.id instead of user object

  // Remove forced refresh on navigation - rely on real-time updates instead

  useEffect(() => {
    if (!user?.id) return

    const targetUserId = searchParams.get('new')

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
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('conversation', existingConversation.id)
        next.delete('new')
        return next
      })
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
      } catch (error) {
        if (isCancelled) return
        logger.error('Unexpected error loading pending conversation', { error, targetUserId })
        setPendingConversation(null)
      }
    }

    loadPendingParticipant()

    return () => {
      isCancelled = true
    }
  }, [searchParams, user?.id, conversations, pendingConversation, setSearchParams])

  // Participant-scoped realtime: refresh whenever any conversation involving the user changes
  useEffect(() => {
    if (!user?.id) {
      return
    }

    const handleConversationChange = () => {
      void fetchConversations({ force: true })
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
      supabase.removeChannel(channel)
    }
  }, [user?.id, fetchConversations])

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
  const hasActiveConversation = Boolean(selectedConversation)
  const isFullBleedMobileLayout = Boolean(messagingMobileV2Enabled && isMobile)

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

      if (selected && !selected.isPending) {
        const unreadDelta = selected.unreadCount ?? 0
        if (unreadDelta > 0) {
          adjustUnreadCount(-unreadDelta)
          void refreshUnreadCount({ bypassCache: true })
        }
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)

        if (selected?.isPending) {
          const targetId =
            selected.participant_one_id === user?.id
              ? selected.participant_two_id
              : selected.participant_one_id

          if (targetId) {
            next.set('new', targetId)
          }
          next.delete('conversation')
        } else {
          next.set('conversation', conversationId)
          next.delete('new')
        }

        return next
      })
    },
    [adjustUnreadCount, combinedConversations, refreshUnreadCount, setSearchParams, user?.id]
  )

  const handleBackToList = useCallback(() => {
    setSelectedConversationId(null)
    setPendingConversation(null)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('conversation')
      next.delete('new')
      return next
    })
  }, [setSearchParams])

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

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('conversation', createdConversation.id)
        next.delete('new')
        return next
      })
      // Don't force refresh - real-time subscription will handle updates
    },
    [setSearchParams]
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
      if (event.type === 'sent') {
        setConversations(prev => {
          const existing = prev.find(conv => conv.id === event.conversationId)
          if (!existing) {
            return prev
          }

          const updatedConversation: Conversation = {
            ...existing,
            lastMessage: {
              content: event.message.content,
              sent_at: event.message.sent_at,
              sender_id: event.message.sender_id
            },
            last_message_at: event.message.sent_at,
            unreadCount: existing.unreadCount ?? 0
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
    []
  )

  useEffect(() => {
    if (!user?.id || !selectedConversationId) {
      return
    }

    const alreadyLoaded = combinedConversations.some(conv => conv.id === selectedConversationId)
    if (alreadyLoaded) {
      return
    }

    let cancelled = false

    const hydrateConversation = async () => {
      try {
        const { data: conversationRow, error } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', selectedConversationId)
          .maybeSingle()

        if (cancelled) return

        if (error || !conversationRow) {
          logger.warn('Conversation id from URL not found', { selectedConversationId, error })
          setSelectedConversationId(null)
          setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.delete('conversation')
            return next
          })
          return
        }

        if (conversationRow.participant_one_id !== user.id && conversationRow.participant_two_id !== user.id) {
          logger.warn('Conversation does not belong to current user', { selectedConversationId })
          setSelectedConversationId(null)
          setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            next.delete('conversation')
            return next
          })
          return
        }

        const otherParticipantId =
          conversationRow.participant_one_id === user.id
            ? conversationRow.participant_two_id
            : conversationRow.participant_one_id

        const [profileResult, lastMessageResult, unreadCountResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, username, avatar_url, role')
            .eq('id', otherParticipantId)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('content, sent_at, sender_id')
            .eq('conversation_id', conversationRow.id)
            .order('sent_at', { ascending: false })
            .limit(1),
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversationRow.id)
            .neq('sender_id', user.id)
            .is('read_at', null)
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
      }
    }

    hydrateConversation()

    return () => {
      cancelled = true
    }
  }, [combinedConversations, selectedConversationId, setSearchParams, user?.id])

  const rootContainerClasses = isFullBleedMobileLayout
    ? 'bg-white min-h-screen-dvh md:min-h-screen'
    : messagingMobileV2Enabled
      ? 'bg-gray-50 min-h-screen-dvh md:min-h-screen'
      : 'min-h-screen bg-gray-50'

  if (loading) {
    return (
      <div className={rootContainerClasses}>
        <Header />
        <div className="flex items-center justify-center pt-20 h-[calc(100dvh-80px)]">
          <main className="max-w-7xl mx-auto px-4 md:px-6 w-full">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden h-[calc(100dvh-140px)]">
              <div className="flex h-full">
                {/* Conversation List Skeleton */}
                <div className="w-full md:w-96 border-r border-gray-200 flex flex-col">
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
                {/* Empty State Skeleton */}
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
      </div>
    )
  }

  const mainPaddingClasses = isFullBleedMobileLayout
    ? 'mx-auto w-full max-w-7xl px-0 pb-0 pt-[calc(var(--app-header-offset,0px)+1rem)] md:px-6'
    : 'mx-auto max-w-7xl px-4 pb-12 pt-[calc(var(--app-header-offset,0px)+1.5rem)] md:px-6'

  const containerClasses = isFullBleedMobileLayout
    ? 'flex h-[calc(100dvh-var(--app-header-offset,0px))] flex-col overflow-hidden bg-white'
    : `flex h-[calc(100dvh-var(--app-header-offset,0px)-4rem)] flex-col overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm ${
        messagingMobileV2Enabled ? 'min-h-chat-card' : ''
      }`

  return (
    <div className={rootContainerClasses}>
      <Header />

      <main className={mainPaddingClasses}>
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
              <div className={`flex-1 min-h-0 ${isFullBleedMobileLayout ? 'border-t border-gray-100 bg-white/95' : ''}`}>
                {filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                      <MessageCircle className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No messages yet</h3>
                    <p className="text-sm text-gray-600">
                      Start a conversation from a player or club profile
                    </p>
                  </div>
                ) : (
                  <ConversationList
                    conversations={filteredConversations}
                    selectedConversationId={selectedConversationId}
                    onSelectConversation={handleSelectConversation}
                    currentUserId={user?.id || ''}
                    variant={isFullBleedMobileLayout ? 'compact' : 'default'}
                  />
                )}
              </div>
            </div>

            {/* Right Column - Chat Window */}
            <div className={`flex min-h-0 flex-1 flex-col ${hasActiveConversation ? 'flex' : 'hidden md:flex'}`}>
              {selectedConversation ? (
                <ChatWindow
                  conversation={selectedConversation}
                  currentUserId={user?.id || ''}
                  onBack={handleBackToList}
                  onMessageSent={handleConversationMessageEvent}
                  onConversationCreated={handleConversationCreated}
                  onConversationRead={handleConversationRead}
                />
              ) : (
                <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-gray-50 p-8 text-center">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <MessageCircle className="w-10 h-10 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a conversation</h3>
                  <p className="text-gray-600 mb-6">
                    Choose a conversation from the list to start messaging
                  </p>
                  {selectedConversationId && (
                    <button
                      onClick={handleBackToList}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                    >
                      Back to conversations
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
