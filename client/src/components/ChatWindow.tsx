import { useState, useEffect, useRef, useCallback, useId, useLayoutEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Send, ArrowLeft } from 'lucide-react'
import { supabase, SUPABASE_URL } from '@/lib/supabase'
import { isUniqueViolationError } from '@/lib/supabaseErrors'
import { format } from 'date-fns'
import { ChatWindowSkeleton } from './Skeleton'
import Avatar from './Avatar'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'
import { withRetry } from '@/lib/retry'
import { requestCache, generateCacheKey } from '@/lib/requestCache'
import { useToastStore } from '@/lib/toast'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useUnreadStore } from '@/lib/unread'

type NullableDate = string | null

export interface Message {
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
const SCROLL_RETRY_LIMIT = 8

type ScrollJobReason = 'initial' | 'append-self' | 'append-inbound' | 'input' | 'manual'

interface ScrollJob {
  type: 'bottom' | 'message'
  messageId?: string
  behavior: ScrollBehavior
  attempts: number
  reason: ScrollJobReason
}

const buildPublicProfilePath = (participant?: ConversationParticipant) => {
  if (!participant) return null
  const slug = participant.username ? participant.username : `id/${participant.id}`
  return participant.role === 'club' ? `/clubs/${slug}` : `/players/${slug}`
}

export type ChatMessageEvent =
  | {
      type: 'sent'
      conversationId: string
      message: Message
    }
  | {
      type: 'read'
      conversationId: string
      messageIds: string[]
    }

interface ChatWindowProps {
  conversation: Conversation
  currentUserId: string
  onBack: () => void
  onMessageSent?: (event: ChatMessageEvent) => void
  onConversationCreated: (conversation: Conversation) => void
  onConversationRead?: (conversationId: string) => void
}

export default function ChatWindow({ conversation, currentUserId, onBack, onMessageSent, onConversationCreated, onConversationRead }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef<Message[]>([])
  const { addToast } = useToastStore()
  const isMobile = useMediaQuery('(max-width: 767px)')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const initialScrollPendingRef = useRef(true)
  const lastMessageIdRef = useRef<string | null>(null)
  const fallbackBaselineInnerHeightRef = useRef<number | null>(null)
  const messageRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingScrollJobRef = useRef<ScrollJob | null>(null)
  const nextScrollFrameRef = useRef<number | null>(null)
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  const pendingReadIdsRef = useRef(new Set<string>())
  const readFlushTimeoutRef = useRef<number | null>(null)
  const textareaId = useId()
  const textareaCharCountId = `${textareaId}-counter`
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const oldestLoadedTimestampRef = useRef<string | null>(null)
  const initializeUnreadStore = useUnreadStore(state => state.initialize)
  const adjustUnreadCount = useUnreadStore(state => state.adjust)
  const refreshUnreadCount = useUnreadStore(state => state.refresh)

  useEffect(() => {
    void initializeUnreadStore(currentUserId || null)
  }, [currentUserId, initializeUnreadStore])

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
      return true
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior })
      return true
    }
    return false
  }, [])

  const scrollToMessage = useCallback(
    (messageId: string, behavior: ScrollBehavior = 'auto') => {
      const container = scrollContainerRef.current
      const target = messageRefs.current.get(messageId)
      if (!container || !target) {
        return false
      }

      const containerRect = container.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const top = Math.max(targetRect.top - containerRect.top + container.scrollTop - 16, 0)
      container.scrollTo({ top, behavior })
      return true
    },
    []
  )

  const runScrollJob = useCallback((): void => {
    const job = pendingScrollJobRef.current
    if (!job) {
      nextScrollFrameRef.current = null
      return
    }

    const didScroll =
      job.type === 'bottom'
        ? scrollToLatest(job.behavior)
        : job.messageId
        ? scrollToMessage(job.messageId, job.behavior)
        : false

    if (didScroll) {
      if (job.reason === 'initial') {
        initialScrollPendingRef.current = false
      }

      if (job.type === 'bottom') {
        shouldStickToBottomRef.current = true
      }

      if (job.reason === 'append-inbound' || job.reason === 'append-self' || job.reason === 'input' || job.reason === 'manual') {
        setPendingNewMessagesCount(0)
      }

      pendingScrollJobRef.current = null
      nextScrollFrameRef.current = null
      return
    }

    if (job.attempts >= SCROLL_RETRY_LIMIT) {
      if (job.reason === 'initial') {
        initialScrollPendingRef.current = false
      }
      pendingScrollJobRef.current = null
      nextScrollFrameRef.current = null
      return
    }

    pendingScrollJobRef.current = { ...job, attempts: job.attempts + 1 }
    nextScrollFrameRef.current = requestAnimationFrame(() => runScrollJob())
  }, [scrollToLatest, scrollToMessage, setPendingNewMessagesCount])

  const scheduleScrollJob = useCallback(
    (job: Omit<ScrollJob, 'attempts'>) => {
      if (job.type === 'message' && !job.messageId) {
        return
      }

      pendingScrollJobRef.current = { ...job, attempts: 0 }

      if (nextScrollFrameRef.current !== null) {
        cancelAnimationFrame(nextScrollFrameRef.current)
      }

      nextScrollFrameRef.current = requestAnimationFrame(() => runScrollJob())
    },
    [runScrollJob]
  )

  const setMessageRef = useCallback(
    (messageId: string) => (node: HTMLDivElement | null) => {
      const refs = messageRefs.current
      const existing = refs.get(messageId)

      if (node) {
        if (existing && existing !== node) {
          intersectionObserverRef.current?.unobserve(existing)
          refs.delete(messageId)
        }
        refs.set(messageId, node)
        if (intersectionObserverRef.current) {
          intersectionObserverRef.current.observe(node)
        }
      } else if (existing) {
        intersectionObserverRef.current?.unobserve(existing)
        refs.delete(messageId)
      }
    },
    []
  )

  const isViewerAtBottom = useCallback(() => {
    const scrollEl = scrollContainerRef.current
    if (!scrollEl) {
      return true
    }
    const distanceFromBottom = scrollEl.scrollHeight - (scrollEl.scrollTop + scrollEl.clientHeight)
    return distanceFromBottom <= 120
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

    syncMessagesState(prev =>
      prev.map(msg => (optimisticIds.has(msg.id) ? { ...msg, read_at: now } : msg))
    )

    try {
      const { error } = await supabase
        .from('messages')
        .update({ read_at: now })
        .in('id', pendingIds)
        .eq('conversation_id', conversation.id)
        .neq('sender_id', currentUserId)
        .is('read_at', null)

      if (error) throw error

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

      if (pendingIds.length > 0) {
        adjustUnreadCount(-pendingIds.length)
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

  // Marks incoming messages as read once ~60% of the bubble is visible in the scroll container.
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting || entry.intersectionRatio < 0.6) {
            return
          }

          const target = entry.target as HTMLElement
          const messageId = target.getAttribute('data-message-id')
          if (!messageId) {
            return
          }

          const message = messagesRef.current.find(msg => msg.id === messageId)
          if (!message) {
            return
          }

          queueReadReceipt(message)
        })
      },
      {
        root: container,
        threshold: [0.6],
        rootMargin: '0px 0px -32px 0px'
      }
    )

    intersectionObserverRef.current = observer
    messageRefs.current.forEach(node => observer.observe(node))

    return () => {
      observer.disconnect()
      intersectionObserverRef.current = null
    }
  }, [conversation.id, queueReadReceipt])

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
    shouldStickToBottomRef.current = true
    setPendingNewMessagesCount(0)
    scheduleScrollJob({ type: 'bottom', behavior: 'smooth', reason: 'manual' })
  }, [scheduleScrollJob])

  useEffect(() => {
    shouldStickToBottomRef.current = true
    initialScrollPendingRef.current = true
    lastMessageIdRef.current = null
    setPendingNewMessagesCount(0)
    messageRefs.current.clear()
    pendingReadIdsRef.current.clear()
    if (readFlushTimeoutRef.current !== null) {
      window.clearTimeout(readFlushTimeoutRef.current)
      readFlushTimeoutRef.current = null
    }
    if (intersectionObserverRef.current) {
      intersectionObserverRef.current.disconnect()
      intersectionObserverRef.current = null
    }
    if (nextScrollFrameRef.current !== null) {
      cancelAnimationFrame(nextScrollFrameRef.current)
      nextScrollFrameRef.current = null
    }
    pendingScrollJobRef.current = null

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
              shouldStickToBottomRef.current = true
            } else {
              shouldStickToBottomRef.current = false
              setPendingNewMessagesCount(count => count + 1)
            }
          } else {
            shouldStickToBottomRef.current = true
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
  }, [conversation.id, conversation.isPending, currentUserId, isViewerAtBottom, syncMessagesState])

  useEffect(() => {
    return () => {
      if (readFlushTimeoutRef.current !== null) {
        window.clearTimeout(readFlushTimeoutRef.current)
        readFlushTimeoutRef.current = null
      }
      void flushPendingReadReceipts()
    }
  }, [flushPendingReadReceipts])

  useEffect(() => {
    return () => {
      if (nextScrollFrameRef.current !== null) {
        cancelAnimationFrame(nextScrollFrameRef.current)
        nextScrollFrameRef.current = null
      }
      pendingScrollJobRef.current = null
    }
  }, [])

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
        setPendingNewMessagesCount(0)
        markConversationAsRead()
      }
    }

    handleScroll()
    scrollEl.addEventListener('scroll', handleScroll, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (shouldStickToBottomRef.current) {
          scrollToLatest('auto')
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
    markConversationAsRead,
    loadOlderMessages,
    scrollToLatest
  ])

  const unreadMetadata = useMemo(() => {
    let firstUnreadId: string | null = null
    let firstUnreadIndex = -1
    let unreadCount = 0

    messages.forEach((msg, index) => {
      if (msg.sender_id !== currentUserId && !msg.read_at) {
        unreadCount += 1
        if (firstUnreadId === null) {
          firstUnreadId = msg.id
          firstUnreadIndex = index
        }
      }
    })

    return { firstUnreadId, firstUnreadIndex, unreadCount }
  }, [messages, currentUserId])

  const hasReadReceipts = useMemo(
    () => messages.some(msg => msg.sender_id !== currentUserId && Boolean(msg.read_at)),
    [messages, currentUserId]
  )

  const shouldRenderUnreadSeparator = hasReadReceipts && unreadMetadata.unreadCount > 0 && unreadMetadata.firstUnreadId !== null

  // Keeps the viewport anchored: initial mount scrolls to the first unread (if any),
  // new messages while the viewer is near the bottom animate into view, and manual
  // upward scrolling is respected until the user returns to the bottom threshold.
  useLayoutEffect(() => {
    if (!messages.length) {
      lastMessageIdRef.current = null
      return
    }

    const latestMessage = messages[messages.length - 1]
    const latestId = latestMessage.id
    const previousLastId = lastMessageIdRef.current
    const isInitialSync = initialScrollPendingRef.current
    const appendedMessage = previousLastId !== null && previousLastId !== latestId

    if (isInitialSync) {
      if (shouldRenderUnreadSeparator && unreadMetadata.firstUnreadId) {
        shouldStickToBottomRef.current = false
        scheduleScrollJob({
          type: 'message',
          messageId: unreadMetadata.firstUnreadId,
          behavior: 'auto',
          reason: 'initial'
        })
      } else {
        shouldStickToBottomRef.current = true
        scheduleScrollJob({ type: 'bottom', behavior: 'auto', reason: 'initial' })
      }
    } else if (appendedMessage) {
      if (latestMessage.sender_id === currentUserId) {
        shouldStickToBottomRef.current = true
        setPendingNewMessagesCount(0)
        scheduleScrollJob({ type: 'bottom', behavior: 'smooth', reason: 'append-self' })
      } else if (isViewerAtBottom() || shouldStickToBottomRef.current) {
        shouldStickToBottomRef.current = true
        scheduleScrollJob({ type: 'bottom', behavior: 'smooth', reason: 'append-inbound' })
      }
    }

    lastMessageIdRef.current = latestId

    if (shouldStickToBottomRef.current) {
      markConversationAsRead()
    }
  }, [
    currentUserId,
    isViewerAtBottom,
    markConversationAsRead,
    messages,
    scheduleScrollJob,
    setPendingNewMessagesCount,
    shouldRenderUnreadSeparator,
    unreadMetadata.firstUnreadId
  ])

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
      inputRef.current?.focus()

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
  const participantName =
    conversation.otherParticipant?.full_name ||
    conversation.otherParticipant?.username ||
    'PLAYR Member'
  const profilePath = buildPublicProfilePath(conversation.otherParticipant)

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
      className={`grid h-full w-full min-h-0 grid-rows-[auto,1fr,auto] overflow-hidden bg-gray-50 ${
        isMobile ? 'pb-[var(--chat-safe-area-bottom,0px)]' : ''
      }`}
    >
      <div
        className={`sticky z-40 flex items-center gap-3 border-b border-gray-200 bg-white pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-4 shadow-sm transition-colors md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile ? 'top-[calc(var(--app-header-offset,0px))] pt-[calc(env(safe-area-inset-top)+1rem)]' : 'top-0'
        } md:top-0`}
      >
        <button
          onClick={onBack}
          className="md:hidden rounded-lg p-2 transition-colors hover:bg-gray-100"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>

        {profilePath ? (
          <Link
            to={profilePath}
            className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
            aria-label={`View ${participantName} profile`}
          >
            <Avatar
              src={avatarUrl}
              alt={participantName}
              initials={conversation.otherParticipant?.full_name?.charAt(0).toUpperCase() || 'P'}
              className="h-12 w-12 text-lg shadow-sm"
              enablePreview={false}
            />
          </Link>
        ) : (
          <Avatar
            src={avatarUrl}
            alt={participantName}
            initials={conversation.otherParticipant?.full_name?.charAt(0).toUpperCase() || 'P'}
            className="h-12 w-12 text-lg shadow-sm"
            enablePreview={false}
          />
        )}

        <div className="min-w-0 flex-1">
          {profilePath ? (
            <Link
              to={profilePath}
              className="block truncate text-lg font-semibold text-gray-900 transition hover:text-purple-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 md:text-xl"
            >
              {participantName}
            </Link>
          ) : (
            <h2 className="truncate text-lg font-semibold text-gray-900 md:text-xl">{participantName}</h2>
          )}
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
        className={`min-h-0 overflow-y-auto overscroll-contain pt-6 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile
            ? 'pb-[calc(var(--chat-composer-height,72px)+var(--chat-safe-area-bottom,0px)+0.25rem)]'
            : 'pb-20 md:pb-16'
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
                const isUnreadMarker =
                  shouldRenderUnreadSeparator &&
                  unreadMetadata.firstUnreadId === message.id &&
                  !isMyMessage

                return (
                  <div
                    key={message.id}
                    ref={setMessageRef(message.id)}
                    data-message-id={message.id}
                  >
                    {showTimestamp && (
                      <div className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-gray-400">
                        {format(new Date(message.sent_at), 'MMM d, yyyy h:mm a')}
                      </div>
                    )}
                    {isUnreadMarker && (
                      <div className="mb-2 flex items-center justify-center text-xs font-semibold uppercase tracking-wide text-purple-500">
                        --- NEW MESSAGES ---
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
            {pendingNewMessagesCount > 0 && (
              <div className="sticky bottom-4 z-10 flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleJumpToLatest}
                  className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-gray-900 shadow-lg ring-1 ring-gray-200 backdrop-blur transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 hover:shadow-xl"
                >
                  {`⬇ ${pendingNewMessagesCount} new message${pendingNewMessagesCount > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <form
        onSubmit={handleSendMessage}
        data-chat-composer="true"
        className={`border-t border-gray-200 bg-white/95 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-3.5 backdrop-blur md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] ${
          isMobile
            ? 'fixed bottom-0 left-0 right-0 z-40 shadow-lg pb-[calc(0.75rem+var(--chat-safe-area-bottom,0px))]'
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
              onFocus={() => {
                shouldStickToBottomRef.current = true
                setPendingNewMessagesCount(0)
                scheduleScrollJob({ type: 'bottom', behavior: 'smooth', reason: 'input' })
              }}
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
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-lg transition-all duration-200 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-60 md:h-12 md:w-12"
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
