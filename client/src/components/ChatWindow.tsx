import { useState, useEffect, useRef, useCallback, useId } from 'react'
import { Send, ArrowLeft } from 'lucide-react'
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import { format } from 'date-fns'
import { ChatWindowSkeleton } from './Skeleton'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/retry'
import { requestCache, generateCacheKey } from '@/lib/requestCache'
import { useToastStore } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'

type NullableDate = string | null

interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  sent_at: string
  read_at: NullableDate
}

interface ConversationParticipant {
  id: string
  full_name: string
  username: string | null
  avatar_url: string | null
  role: 'player' | 'coach' | 'club'
}

interface Conversation {
  id: string
  participant_one_id: string
  participant_two_id: string
  created_at: string
  updated_at: string
  last_message_at: NullableDate
  otherParticipant?: ConversationParticipant
  isPending?: boolean
}

const COMPOSER_MIN_HEIGHT = 48
const COMPOSER_MAX_HEIGHT = 160
const MESSAGES_PAGE_SIZE = 50

interface ChatWindowProps {
  conversation: Conversation
  currentUserId: string
  onBack: () => void
  onMessageSent: () => void
  onConversationCreated: (conversation: Conversation) => void
  onConversationRead?: (conversationId: string) => void
}

export default function ChatWindow({ conversation, currentUserId, onBack, onMessageSent, onConversationCreated, onConversationRead }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNewMessagesIndicator, setShowNewMessagesIndicator] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<Message[]>([])
  const { addToast } = useToastStore()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const initialScrollSyncPending = useRef(true)
  const fallbackBaselineInnerHeightRef = useRef<number | null>(null)
  const pendingUnreadRef = useRef(false)
  const textareaId = useId()
  const textareaCharCountId = `${textareaId}-counter`
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const oldestLoadedTimestampRef = useRef<string | null>(null)

  useEffect(() => {
    setHasMoreMessages(true)
    setIsLoadingMore(false)
    oldestLoadedTimestampRef.current = null
  }, [conversation.id])

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

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollEl = scrollContainerRef.current
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [])

  const isViewerAtBottom = useCallback(() => {
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) {
      return true
    }
    const distanceFromBottom = scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight)
    return distanceFromBottom <= 96
  }, [])

  const syncTextareaHeight = useCallback(() => {
    const textarea = inputRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    const contentHeight = textarea.scrollHeight
    const clampedHeight = Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, contentHeight))
    textarea.style.height = `${clampedHeight}px`
    textarea.style.overflowY = contentHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
  }, [])


  const fetchMessages = useCallback(async () => {
    if (!conversation.id || conversation.isPending) {
      syncMessagesState([])
      setHasMoreMessages(false)
      setLoading(false)
      return [] as Message[]
    }

    setLoading(true)
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
    }
  }, [conversation.id, conversation.isPending, syncMessagesState])

  const markMessagesAsRead = useCallback(
    async (messagesOverride?: Message[], options?: { force?: boolean }): Promise<number> => {
      if (!conversation.id || conversation.isPending) {
        return 0
      }

      const snapshot = messagesOverride ?? messagesRef.current
      if (!snapshot.length) {
        logger.debug('No messages loaded yet, skipping mark-as-read')
        return 0
      }

      const unreadMessages = snapshot.filter(
        msg => msg.sender_id !== currentUserId && !msg.read_at
      )
      const unreadCount = unreadMessages.length

      if (unreadCount === 0) {
        logger.debug('No unread messages to mark, skipping')
        return 0
      }

      const force = options?.force ?? false

      if (!force && !isViewerAtBottom()) {
        logger.debug('Viewer is not at bottom; deferring read receipts')
        pendingUnreadRef.current = true
        return 0
      }

      logger.debug(`Found ${unreadCount} unread messages to mark as read`)

      if (typeof window !== 'undefined' && window.__updateUnreadBadge) {
        window.__updateUnreadBadge(-unreadCount)
        logger.debug(`Optimistically decremented badge by ${unreadCount}`)
      }

      const now = new Date().toISOString()
      const applyReadState = (source: Message[]) =>
        source.map(msg =>
          msg.sender_id !== currentUserId && !msg.read_at
            ? { ...msg, read_at: now }
            : msg
        )

      if (messagesOverride) {
        syncMessagesState(applyReadState(snapshot))
      } else {
        syncMessagesState(prev => applyReadState(prev))
      }

      const cacheKey = generateCacheKey('unread_count', { userId: currentUserId })
      requestCache.invalidate(cacheKey)
      onMessageSent()

      try {
        const { error } = await supabase
          .from('messages')
          .update({ read_at: now })
          .eq('conversation_id', conversation.id)
          .neq('sender_id', currentUserId)
          .is('read_at', null)

        if (error) throw error

        logger.debug('Database confirmed messages as read', {
          conversationId: conversation.id,
          unreadCount
        })

        if (onConversationRead) {
          onConversationRead(conversation.id)
        }

        requestCache.invalidate(cacheKey)
        if (typeof window !== 'undefined' && window.__refreshUnreadBadge) {
          window.__refreshUnreadBadge()
        }
        pendingUnreadRef.current = false
        setShowNewMessagesIndicator(false)
        return unreadCount
      } catch (error) {
        logger.error('Error marking messages as read in database:', error)

        if (typeof window !== 'undefined' && window.__updateUnreadBadge) {
          window.__updateUnreadBadge(unreadCount)
        }

        syncMessagesState(snapshot)
        pendingUnreadRef.current = true
        if (!force) {
          setShowNewMessagesIndicator(true)
        }
        return -unreadCount
      }
    },
    [
      conversation.id,
      conversation.isPending,
      currentUserId,
      isViewerAtBottom,
      onConversationRead,
      onMessageSent,
      setShowNewMessagesIndicator,
      syncMessagesState
    ]
  )

  const loadOlderMessages = useCallback(async () => {
    if (!conversation.id || isLoadingMore || !hasMoreMessages) {
      return
    }

    const oldestTimestamp = oldestLoadedTimestampRef.current
    if (!oldestTimestamp) {
      setHasMoreMessages(false)
      return
    }

    const scrollEl = scrollContainerRef.current
    const previousScrollHeight = scrollEl?.scrollHeight ?? 0
    const previousScrollTop = scrollEl?.scrollTop ?? 0

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
        return
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

      requestAnimationFrame(() => {
        if (!scrollEl) {
          return
        }
        const newScrollHeight = scrollEl.scrollHeight
        const heightDelta = newScrollHeight - previousScrollHeight
        if (heightDelta > 0) {
          scrollEl.scrollTop = previousScrollTop + heightDelta
        }
      })
    } catch (error) {
      logger.error('Error loading older messages:', error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [conversation.id, hasMoreMessages, isLoadingMore, syncMessagesState])

  const handleJumpToLatest = useCallback(() => {
    scrollToLatest('smooth')
    shouldStickToBottomRef.current = true
    pendingUnreadRef.current = false
    setShowNewMessagesIndicator(false)
    void markMessagesAsRead(undefined, { force: true })
  }, [markMessagesAsRead, scrollToLatest])

  useEffect(() => {
    shouldStickToBottomRef.current = true
    initialScrollSyncPending.current = true
    pendingUnreadRef.current = false
    setShowNewMessagesIndicator(false)

    if (!conversation.id || conversation.isPending) {
      setLoading(false)
      syncMessagesState([])
      return
    }

    let cancelled = false

    const loadConversation = async () => {
      const fetched = await fetchMessages()
      if (cancelled) return

  const marked = await markMessagesAsRead(fetched, { force: true })
      if (cancelled) return

      if (marked <= 0) {
        const cacheKey = generateCacheKey('unread_count', { userId: currentUserId })
        requestCache.invalidate(cacheKey)
        if (typeof window !== 'undefined' && window.__refreshUnreadBadge) {
          window.__refreshUnreadBadge()
        }
      }
    }

    loadConversation()

    return () => {
      cancelled = true
    }
  }, [conversation.id, conversation.isPending, currentUserId, fetchMessages, markMessagesAsRead, syncMessagesState])

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
          let messageAppended = false

          syncMessagesState(prev => {
            if (prev.some(msg => msg.id === newMessage.id)) {
              return prev
            }
            messageAppended = true
            return [...prev, newMessage]
          })

          if (!messageAppended) {
            return
          }

          if (newMessage.sender_id !== currentUserId) {
            if (isViewerAtBottom()) {
              void markMessagesAsRead(undefined, { force: false })
            } else {
              pendingUnreadRef.current = true
              setShowNewMessagesIndicator(true)
            }
          }
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
  }, [
    conversation.id,
    conversation.isPending,
    currentUserId,
    isViewerAtBottom,
    markMessagesAsRead,
    setShowNewMessagesIndicator,
    syncMessagesState
  ])

  useEffect(() => {
    if (!isMobile || typeof window === 'undefined') {
      return
    }

    const updateViewportInsets = () => {
      if (window.visualViewport) {
        const viewport = window.visualViewport
        if (!viewport) {
          return
        }

        const bottomInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        const rightInset = Math.max(0, window.innerWidth - (viewport.width + viewport.offsetLeft))
        fallbackBaselineInnerHeightRef.current = window.innerHeight
        document.documentElement.style.setProperty(
          '--chat-safe-area-bottom',
          `calc(${bottomInset}px + env(safe-area-inset-bottom, 0px))`
        )
        document.documentElement.style.setProperty('--chat-safe-area-right', `${rightInset}px`)
        return
      }

      if (fallbackBaselineInnerHeightRef.current === null || window.innerHeight >= fallbackBaselineInnerHeightRef.current) {
        fallbackBaselineInnerHeightRef.current = window.innerHeight
  document.documentElement.style.setProperty('--chat-safe-area-bottom', 'env(safe-area-inset-bottom, 0px)')
      } else {
        const bottomInset = Math.max(0, fallbackBaselineInnerHeightRef.current - window.innerHeight)
        document.documentElement.style.setProperty(
          '--chat-safe-area-bottom',
          `calc(${bottomInset}px + env(safe-area-inset-bottom, 0px))`
        )
      }

      document.documentElement.style.setProperty('--chat-safe-area-right', '0px')
    }

    updateViewportInsets()

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportInsets)
      window.visualViewport.addEventListener('scroll', updateViewportInsets)

      return () => {
        window.visualViewport?.removeEventListener('resize', updateViewportInsets)
        window.visualViewport?.removeEventListener('scroll', updateViewportInsets)
        document.documentElement.style.removeProperty('--chat-safe-area-bottom')
        document.documentElement.style.removeProperty('--chat-safe-area-right')
        fallbackBaselineInnerHeightRef.current = null
      }
    }

    window.addEventListener('resize', updateViewportInsets)
    window.addEventListener('orientationchange', updateViewportInsets)

    return () => {
      window.removeEventListener('resize', updateViewportInsets)
      window.removeEventListener('orientationchange', updateViewportInsets)
      document.documentElement.style.removeProperty('--chat-safe-area-bottom')
      document.documentElement.style.removeProperty('--chat-safe-area-right')
      fallbackBaselineInnerHeightRef.current = null
    }
  }, [isMobile])

  useEffect(() => {
    const updateComposerHeight = () => {
      const composerElement = inputRef.current?.closest('[data-chat-composer="true"]') as HTMLElement | null
      if (!composerElement) {
        return
      }
      document.documentElement.style.setProperty('--chat-composer-height', `${composerElement.getBoundingClientRect().height}px`)
      if (shouldStickToBottomRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight })
      }
    }

    updateComposerHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateComposerHeight)
      window.addEventListener('orientationchange', updateComposerHeight)

      return () => {
        window.removeEventListener('resize', updateComposerHeight)
        window.removeEventListener('orientationchange', updateComposerHeight)
        document.documentElement.style.removeProperty('--chat-composer-height')
      }
    }

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === inputRef.current?.closest('[data-chat-composer="true"]')) {
          document.documentElement.style.setProperty('--chat-composer-height', `${entry.contentRect.height}px`)
        }
      }
    })

    const composerElement = inputRef.current?.closest('[data-chat-composer="true"]') as HTMLElement | null
    if (composerElement) {
      observer.observe(composerElement)
    }

    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--chat-composer-height')
    }
  }, [])

  useEffect(() => {
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) return

    const handleScroll = () => {
      const container = scrollContainerRef.current

      if (container && container.scrollTop < 120 && hasMoreMessages && !isLoadingMore) {
        void loadOlderMessages()
      }

      const atBottom = isViewerAtBottom()
      shouldStickToBottomRef.current = atBottom

      if (atBottom) {
        if (showNewMessagesIndicator) {
          setShowNewMessagesIndicator(false)
        }

        if (pendingUnreadRef.current) {
          pendingUnreadRef.current = false
          void markMessagesAsRead(undefined, { force: false })
        }
      }
    }

    handleScroll()
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (shouldStickToBottomRef.current) {
          scrollToLatest('auto')
          shouldStickToBottomRef.current = true
        }
      })
      observer.observe(scrollEl)

      return () => {
        scrollEl.removeEventListener('scroll', handleScroll)
        observer.disconnect()
      }
    }

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll)
    }
  }, [
    conversation.id,
    hasMoreMessages,
    isLoadingMore,
    isViewerAtBottom,
    loadOlderMessages,
    markMessagesAsRead,
    scrollToLatest,
    setShowNewMessagesIndicator,
    showNewMessagesIndicator
  ])

  useEffect(() => {
    if (!messages.length) {
      return
    }

    const lastMessage = messages[messages.length - 1]
    const isOwnMessage = lastMessage?.sender_id === currentUserId
    const shouldAutoScroll =
      initialScrollSyncPending.current || isOwnMessage || shouldStickToBottomRef.current

    if (shouldAutoScroll) {
      requestAnimationFrame(() => {
        scrollToLatest(initialScrollSyncPending.current ? 'auto' : 'smooth')
        shouldStickToBottomRef.current = true
        initialScrollSyncPending.current = false
        pendingUnreadRef.current = false
        setShowNewMessagesIndicator(false)
      })
    }
  }, [messages, currentUserId, scrollToLatest])

  useEffect(() => {
    syncTextareaHeight()
  }, [conversation.id, newMessage, syncTextareaHeight])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || sending) return

    const messageContent = newMessage.trim()
    if (messageContent.length > 1000) {
      addToast('Message is too long. Maximum 1000 characters.', 'error')
      return
    }

    setSending(true)
    shouldStickToBottomRef.current = true
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
          const isUniqueViolation =
            parsedError?.code === '23505' ||
            parsedError?.message?.includes('duplicate key value') ||
            parsedError?.details?.includes('already exists')

          if (!isUniqueViolation) {
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
      inputRef.current?.focus()

      const conversationIdForMetrics = activeConversationId

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
            syncMessagesState(prev => prev.map(msg => (msg.id === optimisticId ? persisted : msg)))
          }
        },
        { conversationId: conversationIdForMetrics }
      )

      onMessageSent()

      if (newlyCreatedConversation) {
        onConversationCreated(newlyCreatedConversation)
      }
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
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const syntheticEvent = e as unknown as React.FormEvent
      handleSendMessage(syntheticEvent)
    }
  }

  const getAvatarUrl = (avatarUrl: string | null) => {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('http')) return avatarUrl
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`
  }

  const avatarUrl = getAvatarUrl(conversation.otherParticipant?.avatar_url || null)

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3 bg-white">
          <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="flex-1">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse mb-2"></div>
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>
        <ChatWindowSkeleton />
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="h-12 bg-gray-100 rounded-xl animate-pulse"></div>
        </div>
      </div>
    )
  }

  const canSend = newMessage.trim().length > 0
  const isSendDisabled = !canSend || sending

  return (
    <div
      className={`flex h-full w-full min-h-0 flex-col bg-gray-50 ${
        isMobile ? 'pb-[var(--chat-safe-area-bottom,0px)]' : ''
      }`}
    >
      <div
        className={`flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-4 shadow-sm md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile ? 'sticky top-0 z-40 pt-[calc(env(safe-area-inset-top)+1rem)]' : 'sticky top-[var(--app-header-offset,0px)] z-30'
        }`}
      >
        <button
          onClick={onBack}
          className="md:hidden rounded-lg p-2 transition-colors hover:bg-gray-100"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>

        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={conversation.otherParticipant?.full_name}
            className="h-12 w-12 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-lg font-semibold text-white shadow-sm">
            {conversation.otherParticipant?.full_name?.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-gray-900 md:text-xl">
            {conversation.otherParticipant?.full_name}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium md:text-sm ${
                conversation.otherParticipant?.role === 'club'
                  ? 'bg-orange-50 text-orange-700'
                  : conversation.otherParticipant?.role === 'coach'
                  ? 'bg-purple-50 text-purple-700'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              {conversation.otherParticipant?.role === 'club'
                ? 'Club'
                : conversation.otherParticipant?.role === 'coach'
                ? 'Coach'
                : 'Player'}
            </span>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain pt-6 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile
            ? 'pb-[calc(var(--chat-composer-height,72px)+var(--chat-safe-area-bottom,0px)+0.75rem)]'
            : 'pb-24 md:pb-20'
        }`}
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center text-center text-gray-500">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {isLoadingMore && (
              <div className="flex justify-center pb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
                Loading earlier messages…
              </div>
            )}
            <div className="flex flex-col gap-4">
              {messages.map((message, index) => {
                const isMyMessage = message.sender_id === currentUserId
                const isPending = message.id.startsWith('optimistic-')
                const showTimestamp =
                  index === 0 ||
                  new Date(message.sent_at).getTime() - new Date(messages[index - 1].sent_at).getTime() > 300000

                return (
                  <div key={message.id}>
                    {showTimestamp && (
                      <div className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
                        {format(new Date(message.sent_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    )}
                    <div className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm md:max-w-[70%] ${
                          isMyMessage
                            ? isPending
                              ? 'bg-gradient-to-br from-[#6366f1]/70 to-[#8b5cf6]/70 text-white'
                              : 'bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white'
                            : 'bg-white text-gray-900'
                        } ${!isMyMessage ? 'border border-gray-200' : ''}`}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <p className={isMyMessage ? 'text-purple-100' : 'text-gray-500'}>
                            {format(new Date(message.sent_at), 'h:mm a')}
                          </p>
                          {isPending && (
                            <span className="flex items-center gap-1 text-purple-100">
                              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Sending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </div>
            {showNewMessagesIndicator && (
              <div className="sticky bottom-4 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleJumpToLatest}
                  className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg ring-1 ring-gray-200 backdrop-blur transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 hover:shadow-xl"
                >
                  New messages, tap to jump
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <form
        onSubmit={handleSendMessage}
        data-chat-composer="true"
        className={`flex-shrink-0 border-t border-gray-200 bg-white/95 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-4 backdrop-blur md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile
            ? 'fixed bottom-0 left-0 right-0 z-40 shadow-lg pb-[calc(1rem+var(--chat-safe-area-bottom,0px))]'
            : ''
        }`}
      >
        <div className="flex items-end gap-3 md:gap-4">
          <div className="relative flex-1">
            <label htmlFor={textareaId} className="sr-only">
              Message
            </label>
            <textarea
              ref={inputRef}
              value={newMessage}
              onChange={e => {
                setNewMessage(e.target.value)
                syncTextareaHeight()
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              maxLength={1000}
              id={textareaId}
              aria-describedby={textareaCharCountId}
              className="w-full resize-none rounded-xl border border-transparent bg-gray-100 px-4 py-3 text-base leading-relaxed shadow-inner outline-none transition focus:border-purple-200 focus:bg-white focus:ring-2 focus:ring-purple-100 md:rounded-2xl md:px-5 md:py-3 overflow-y-hidden"
            />
            <div
              id={textareaCharCountId}
              className="pointer-events-none absolute bottom-2 right-3 text-xs font-medium text-gray-400 md:bottom-2.5 md:right-3"
              aria-live="polite"
            >
              {newMessage.length}/1000
            </div>
          </div>
          <button
            type="submit"
            disabled={isSendDisabled}
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-lg transition-all duration-200 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Send message"
          >
            {sending ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
