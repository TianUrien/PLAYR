import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { isUniqueViolationError } from '@/lib/supabaseErrors'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/retry'
import { requestCache, generateCacheKey } from '@/lib/requestCache'
import { useToastStore } from '@/lib/toast'
import { useUnreadStore } from '@/lib/unread'
import { loadMessageDraft, saveMessageDraft, clearMessageDraft } from '@/lib/messageDrafts'
import type { Message, Conversation, ChatMessageEvent } from '@/types/chat'

const MESSAGES_PAGE_SIZE = 50

type ConversationSnapshot = {
  id: string
  isPending?: boolean
  participantOneId?: string | null
  participantTwoId?: string | null
  otherParticipantId?: string | null
}

const deriveConversationDraftKey = (conversation: ConversationSnapshot, viewerId: string | null) => {
  if (!viewerId) {
    return null
  }

  if (conversation.id && !conversation.isPending) {
    return conversation.id
  }

  const otherParticipantId = conversation.participantOneId === viewerId
    ? conversation.participantTwoId ?? conversation.otherParticipantId ?? null
    : conversation.participantTwoId === viewerId
    ? conversation.participantOneId ?? conversation.otherParticipantId ?? null
    : conversation.otherParticipantId ?? conversation.participantTwoId ?? conversation.participantOneId ?? null

  if (!otherParticipantId) {
    return null
  }

  return `pending-${otherParticipantId}`
}

interface UseChatProps {
  conversation: Conversation
  currentUserId: string
  onMessageSent?: (event: ChatMessageEvent) => void
  onConversationCreated: (conversation: Conversation) => void
  onConversationRead?: (conversationId: string) => void
}

export function useChat({
  conversation,
  currentUserId,
  onMessageSent,
  onConversationCreated,
  onConversationRead
}: UseChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  
  const messagesRef = useRef<Message[]>([])
  const fetchMessagesPromiseRef = useRef<Promise<Message[]> | null>(null)
  const oldestLoadedTimestampRef = useRef<string | null>(null)
  const pendingReadIdsRef = useRef(new Set<string>())
  const readFlushTimeoutRef = useRef<number | null>(null)
  
  const { addToast } = useToastStore()
  const initializeUnreadStore = useUnreadStore(state => state.initialize)
  const adjustUnreadCount = useUnreadStore(state => state.adjust)
  const refreshUnreadCount = useUnreadStore(state => state.refresh)

  const {
    id: conversationId,
    isPending: conversationIsPending,
    participant_one_id: participantOneId,
    participant_two_id: participantTwoId,
    otherParticipant
  } = conversation
  
  const otherParticipantId = otherParticipant?.id ?? null
  
  const conversationDraftKey = useMemo(
    () =>
      deriveConversationDraftKey(
        {
          id: conversationId,
          isPending: conversationIsPending,
          participantOneId,
          participantTwoId,
          otherParticipantId
        },
        currentUserId
      ),
    [conversationId, conversationIsPending, otherParticipantId, participantOneId, participantTwoId, currentUserId]
  )

  useEffect(() => {
    void initializeUnreadStore(currentUserId || null)
  }, [currentUserId, initializeUnreadStore])

  useEffect(() => {
    setHasMoreMessages(true)
    setIsLoadingMore(false)
    oldestLoadedTimestampRef.current = null
  }, [conversation.id])

  // Draft management
  useEffect(() => {
    if (!conversationDraftKey || !currentUserId) {
      setNewMessage('')
      return
    }

    const draft = loadMessageDraft(currentUserId, conversationDraftKey)
    setNewMessage(draft)
  }, [conversationDraftKey, currentUserId])

  useEffect(() => {
    if (!conversationDraftKey || !currentUserId) {
      return
    }

    const handle = window.setTimeout(() => {
      if (!newMessage.trim()) {
        clearMessageDraft(currentUserId, conversationDraftKey)
        return
      }
      saveMessageDraft(currentUserId, conversationDraftKey, newMessage)
    }, 400)

    return () => {
      window.clearTimeout(handle)
    }
  }, [conversationDraftKey, currentUserId, newMessage])

  const syncMessagesState = useCallback(
    (next: Message[] | ((prev: Message[]) => Message[])) => {
      if (typeof next === 'function') {
        setMessages(prev => {
          const resolved = next(prev)
          messagesRef.current = resolved
          return resolved
        })
      } else {
        messagesRef.current = next
        setMessages(next)
      }
    },
    []
  )

  const fetchMessages = useCallback(async () => {
    if (!conversation.id || conversation.isPending) {
      syncMessagesState([])
      setHasMoreMessages(false)
      setLoading(false)
      return [] as Message[]
    }

    if (fetchMessagesPromiseRef.current) {
      return fetchMessagesPromiseRef.current
    }

    setLoading(true)
    const pendingFetch = (async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('sent_at', { ascending: false })
          .limit(MESSAGES_PAGE_SIZE)

        if (error) throw error

        const fetched = (data ?? []).reverse()
        logger.debug('Fetched messages:', fetched)
        syncMessagesState(fetched)
        oldestLoadedTimestampRef.current = fetched[0]?.sent_at ?? null
        setHasMoreMessages((data ?? []).length === MESSAGES_PAGE_SIZE)
        return fetched
      } catch (error) {
        logger.error('Error fetching messages:', error)
        syncMessagesState([])
        setHasMoreMessages(false)
        return [] as Message[]
      } finally {
        setLoading(false)
        fetchMessagesPromiseRef.current = null
      }
    })()

    fetchMessagesPromiseRef.current = pendingFetch
    return pendingFetch
  }, [conversation.id, conversation.isPending, syncMessagesState])

  const loadOlderMessages = useCallback(async () => {
    if (!conversation.id || isLoadingMore || !hasMoreMessages) {
      return false
    }

    const oldestTimestamp = oldestLoadedTimestampRef.current
    if (!oldestTimestamp) {
      setHasMoreMessages(false)
      return false
    }

    setIsLoadingMore(true)

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .lt('sent_at', oldestTimestamp)
        .order('sent_at', { ascending: false })
        .limit(MESSAGES_PAGE_SIZE)

      if (error) {
        throw error
      }

      const fetched = data ?? []

      if (!fetched.length) {
        setHasMoreMessages(false)
        return false
      }

      const olderMessages = fetched.reverse()
      oldestLoadedTimestampRef.current = olderMessages[0]?.sent_at ?? oldestTimestamp
      setHasMoreMessages(fetched.length === MESSAGES_PAGE_SIZE)

      syncMessagesState(prev => {
        if (!olderMessages.length) {
          return prev
        }

        const existingIds = new Set(prev.map(msg => msg.id))
        const deduped = olderMessages.filter(msg => !existingIds.has(msg.id))

        if (deduped.length === 0) {
          return prev
        }

        return [...deduped, ...prev]
      })
      
      return true
    } catch (error) {
      logger.error('Error loading older messages:', error)
      return false
    } finally {
      setIsLoadingMore(false)
    }
  }, [conversation.id, hasMoreMessages, isLoadingMore, syncMessagesState])

  const flushPendingReadReceipts = useCallback(async () => {
    if (!conversation.id || conversation.isPending) {
      pendingReadIdsRef.current.clear()
      return
    }

    const pendingIds = Array.from(pendingReadIdsRef.current)
    if (!pendingIds.length) {
      return
    }

    pendingReadIdsRef.current.clear()
    const optimisticIds = new Set(pendingIds)
    const now = new Date().toISOString()
    const cacheKey = generateCacheKey('unread_count', { userId: currentUserId })
    let latestPendingSentAt: string | null = null

    messagesRef.current.forEach(msg => {
      if (!optimisticIds.has(msg.id)) {
        return
      }
      if (!latestPendingSentAt || msg.sent_at > latestPendingSentAt) {
        latestPendingSentAt = msg.sent_at
      }
    })

    syncMessagesState(prev =>
      prev.map(msg => (optimisticIds.has(msg.id) ? { ...msg, read_at: now } : msg))
    )

    try {
      const { data: updatedRows, error } = await supabase.rpc('mark_conversation_messages_read', {
        p_conversation_id: conversation.id,
        p_before: latestPendingSentAt
      })

      if (error) throw error
      const affectedRows = typeof updatedRows === 'number' ? updatedRows : pendingIds.length

      if (onConversationRead && pendingIds.length > 0) {
        onConversationRead(conversation.id)
      }

      requestCache.invalidate(cacheKey)
      if (onMessageSent && pendingIds.length > 0 && conversation.id) {
        onMessageSent({
          type: 'read',
          conversationId: conversation.id,
          messageIds: pendingIds
        })
      }

      if (affectedRows > 0) {
        adjustUnreadCount(-affectedRows)
        void refreshUnreadCount({ bypassCache: true })
      }
    } catch (error) {
      logger.error('Error marking messages as read in database:', error)

      syncMessagesState(prev =>
        prev.map(msg => (optimisticIds.has(msg.id) ? { ...msg, read_at: null } : msg))
      )

      pendingIds.forEach(id => pendingReadIdsRef.current.add(id))
    }
  }, [
    adjustUnreadCount,
    conversation.id,
    conversation.isPending,
    currentUserId,
    onConversationRead,
    onMessageSent,
    refreshUnreadCount,
    syncMessagesState
  ])

  const queueReadReceipt = useCallback(
    (message: Message) => {
      if (message.sender_id === currentUserId || message.read_at) {
        return
      }

      if (pendingReadIdsRef.current.has(message.id)) {
        return
      }

      pendingReadIdsRef.current.add(message.id)

      if (readFlushTimeoutRef.current !== null) {
        return
      }

      readFlushTimeoutRef.current = window.setTimeout(() => {
        readFlushTimeoutRef.current = null
        void flushPendingReadReceipts()
      }, 200)
    },
    [currentUserId, flushPendingReadReceipts]
  )

  const markConversationAsRead = useCallback((options?: { immediate?: boolean }) => {
    if (!conversation.id || conversation.isPending) {
      return
    }

    const unreadMessages = messagesRef.current.filter(
      msg => msg.sender_id !== currentUserId && !msg.read_at
    )

    if (!unreadMessages.length) {
      return
    }

    unreadMessages.forEach(queueReadReceipt)

    if (options?.immediate) {
      if (readFlushTimeoutRef.current !== null) {
        window.clearTimeout(readFlushTimeoutRef.current)
        readFlushTimeoutRef.current = null
      }
      void flushPendingReadReceipts()
    }
  }, [conversation.id, conversation.isPending, currentUserId, flushPendingReadReceipts, queueReadReceipt])

  const sendMessage = async (content: string) => {
    if (!content.trim() || sending) return

    const messageContent = content.trim()
    if (messageContent.length > 1000) {
      addToast('Message is too long. Maximum 1000 characters.', 'error')
      return
    }

    setSending(true)
    
    const otherParticipantId =
      conversation.participant_one_id === currentUserId
        ? conversation.participant_two_id
        : conversation.participant_one_id

    if (!otherParticipantId) {
      logger.error('Cannot determine recipient for conversation', { conversation })
      setSending(false)
      return
    }

    let activeConversationId: string | null = conversation.isPending ? null : conversation.id
    let newlyCreatedConversation: Conversation | null = null
    let optimisticId: string | null = null
    let conversationCreatedForSend = false

    try {
      if (!activeConversationId) {
        try {
          const result = await withRetry(async () => {
            const response = await supabase
              .from('conversations')
              .insert({
                participant_one_id: currentUserId,
                participant_two_id: otherParticipantId
              })
              .select()

            if (response.error) throw response.error
            return response
          })

          const createdConversation = result.data?.[0]
          if (!createdConversation) {
            throw new Error('Failed to create conversation')
          }

          activeConversationId = createdConversation.id
          newlyCreatedConversation = {
            ...createdConversation,
            otherParticipant: conversation.otherParticipant,
            isPending: false
          }
          conversationCreatedForSend = true
        } catch (creationError: unknown) {
          const parsedError = creationError as { code?: string; message?: string; details?: string }
          if (!isUniqueViolationError(parsedError)) {
            throw creationError
          }

          const { data: existingConversation, error: existingConversationError } = await supabase
            .from('conversations')
            .select('*')
            .or(
              `and(participant_one_id.eq.${currentUserId},participant_two_id.eq.${otherParticipantId}),and(participant_one_id.eq.${otherParticipantId},participant_two_id.eq.${currentUserId})`
            )
            .maybeSingle()

          if (existingConversationError) {
            throw existingConversationError
          }

          if (!existingConversation) {
            throw creationError
          }

          activeConversationId = existingConversation.id
          newlyCreatedConversation = {
            ...existingConversation,
            otherParticipant: conversation.otherParticipant,
            isPending: false
          }
        }
      }

      const idempotencyKey = `${currentUserId}-${Date.now()}-${Math.random()}`
      optimisticId = `optimistic-${idempotencyKey}`

      const optimisticMessage: Message = {
        id: optimisticId,
        conversation_id: activeConversationId,
        sender_id: currentUserId,
        content: messageContent,
        sent_at: new Date().toISOString(),
        read_at: null
      }

      syncMessagesState(prev => [...prev, optimisticMessage])
      setNewMessage('')
      clearMessageDraft(currentUserId, conversationDraftKey)
      
      const conversationIdForMetrics = activeConversationId
      let deliveredMessage: Message | null = null

      await monitor.measure(
        'send_message',
        async () => {
          const result = await withRetry(async () => {
            const res = await supabase
              .from('messages')
              .insert({
                conversation_id: conversationIdForMetrics,
                sender_id: currentUserId,
                content: messageContent,
                idempotency_key: idempotencyKey
              })
              .select()

            if (res.error) throw res.error
            return res
          })

          const { data, error } = result
          if (error) throw error

          if (data && data[0]) {
            logger.debug('Message sent successfully, replacing optimistic message')
            const persisted = data[0] as Message
            deliveredMessage = persisted
            syncMessagesState(prev => prev.map(msg => (msg.id === optimisticId ? persisted : msg)))
          }
        },
        { conversationId: conversationIdForMetrics }
      )

      if (onMessageSent) {
        onMessageSent({
          type: 'sent',
          conversationId: conversationIdForMetrics,
          message: deliveredMessage ?? optimisticMessage
        })
      }

      if (newlyCreatedConversation) {
        onConversationCreated(newlyCreatedConversation)
      }
      
      return true
    } catch (error) {
      logger.error('Error sending message:', error)
      if (optimisticId) {
        const finalOptimisticId = optimisticId
        syncMessagesState(prev => prev.filter(msg => msg.id !== finalOptimisticId))
      }
      setNewMessage(messageContent)

      if (conversationCreatedForSend && newlyCreatedConversation) {
        try {
          await supabase
            .from('conversations')
            .delete()
            .eq('id', newlyCreatedConversation.id)
        } catch (cleanupError) {
          logger.error('Failed to rollback empty conversation after send failure', cleanupError)
        }
      }

      addToast('Failed to send message. Please try again.', 'error')
      return false
    } finally {
      setSending(false)
    }
  }

  // Realtime subscription
  useEffect(() => {
    if (!conversation.id || conversation.isPending) return

    const channel = supabase
      .channel(`conversation-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`
        },
        payload => {
          const newMessage = payload.new as Message
          
          syncMessagesState(prev => {
            if (prev.some(msg => msg.id === newMessage.id)) {
              return prev
            }
            return [...prev, newMessage]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`
        },
        payload => {
          const updated = payload.new as Message
          syncMessagesState(prev =>
            prev.map(msg => (msg.id === updated.id ? updated : msg))
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation.id, conversation.isPending, currentUserId, syncMessagesState])

  // Initial load
  useEffect(() => {
    pendingReadIdsRef.current.clear()
    fetchMessagesPromiseRef.current = null
    if (readFlushTimeoutRef.current !== null) {
      window.clearTimeout(readFlushTimeoutRef.current)
      readFlushTimeoutRef.current = null
    }

    if (!conversation.id || conversation.isPending) {
      setLoading(false)
      syncMessagesState([])
      return
    }

    let cancelled = false

    const loadConversation = async () => {
      await fetchMessages()
      if (cancelled) return
      markConversationAsRead({ immediate: true })
    }

    loadConversation()

    return () => {
      cancelled = true
      if (readFlushTimeoutRef.current !== null) {
        window.clearTimeout(readFlushTimeoutRef.current)
        readFlushTimeoutRef.current = null
      }
      void flushPendingReadReceipts()
    }
  }, [conversation.id, conversation.isPending, fetchMessages, flushPendingReadReceipts, markConversationAsRead, syncMessagesState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readFlushTimeoutRef.current !== null) {
        window.clearTimeout(readFlushTimeoutRef.current)
        readFlushTimeoutRef.current = null
      }
      void flushPendingReadReceipts()
    }
  }, [flushPendingReadReceipts])

  return {
    messages,
    loading,
    sending,
    newMessage,
    setNewMessage,
    hasMoreMessages,
    isLoadingMore,
    sendMessage,
    loadOlderMessages,
    queueReadReceipt,
    markConversationAsRead
  }
}
