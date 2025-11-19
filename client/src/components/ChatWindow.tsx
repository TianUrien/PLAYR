import { useState, useEffect, useRef, useCallback, useId, useLayoutEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from 'react-router-dom'
import { Send, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUPABASE_URL } from '@/lib/supabase'
import { format } from 'date-fns'
import { ChatWindowSkeleton } from './Skeleton'
import Avatar from './Avatar'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useChat } from '@/hooks/useChat'
import type { Conversation, ChatMessageEvent, ConversationParticipant } from '@/types/chat'

const COMPOSER_MIN_HEIGHT = 48
const COMPOSER_MAX_HEIGHT = 160
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

interface ChatWindowProps {
  conversation: Conversation
  currentUserId: string
  onBack: () => void
  onMessageSent?: (event: ChatMessageEvent) => void
  onConversationCreated: (conversation: Conversation) => void
  onConversationRead?: (conversationId: string) => void
  isImmersiveMobile?: boolean
}

export default function ChatWindow({ conversation, currentUserId, onBack, onMessageSent, onConversationCreated, onConversationRead, isImmersiveMobile = false }: ChatWindowProps) {
  const {
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
  } = useChat({
    conversation,
    currentUserId,
    onMessageSent,
    onConversationCreated,
    onConversationRead
  })

  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 12
  })
  const shouldStickToBottomRef = useRef(true)
  const initialScrollPendingRef = useRef(true)
  const lastMessageIdRef = useRef<string | null>(null)
  const fallbackBaselineInnerHeightRef = useRef<number | null>(null)
  const messageRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingScrollJobRef = useRef<ScrollJob | null>(null)
  const nextScrollFrameRef = useRef<number | null>(null)
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  const textareaId = useId()
  const textareaCharCountId = `${textareaId}-counter`

  useEffect(() => {
    setPendingNewMessagesCount(0)
    initialScrollPendingRef.current = true
    lastMessageIdRef.current = null
    shouldStickToBottomRef.current = true
  }, [conversation.id])

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'auto') => {
    const scrollEl = scrollContainerRef.current
    if (scrollEl) {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior })
      return true
    }
    if (messages.length > 0) {
      messageVirtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
    }
    return false
  }, [messageVirtualizer, messages.length])

  const scrollToMessage = useCallback(
    (messageId: string, behavior: ScrollBehavior = 'auto') => {
      const container = scrollContainerRef.current
      const target = messageRefs.current.get(messageId)
      if (container && target) {
        const containerRect = container.getBoundingClientRect()
        const targetRect = target.getBoundingClientRect()
        const top = Math.max(targetRect.top - containerRect.top + container.scrollTop - 16, 0)
        container.scrollTo({ top, behavior })
        return true
      }

      const fallbackIndex = messages.findIndex(msg => msg.id === messageId)
      if (fallbackIndex >= 0) {
        messageVirtualizer.scrollToIndex(fallbackIndex, { align: 'start' })
      }
      return false
    },
    [messages, messageVirtualizer]
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
        messageVirtualizer.measureElement(node)
      } else if (existing) {
        intersectionObserverRef.current?.unobserve(existing)
        refs.delete(messageId)
      }
    },
    [messageVirtualizer]
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

          const message = messages.find(msg => msg.id === messageId)
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
  }, [conversation.id, queueReadReceipt, messages])

  const handleJumpToLatest = useCallback(() => {
    shouldStickToBottomRef.current = true
    setPendingNewMessagesCount(0)
    scheduleScrollJob({ type: 'bottom', behavior: 'smooth', reason: 'manual' })
  }, [scheduleScrollJob])

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
        void loadOlderMessages().then((loaded) => {
           if (loaded) {
             // Maintain scroll position logic is handled in useChat? No, useChat just updates messages.
             // We need to handle scroll position maintenance here if useChat doesn't.
             // useChat returns true if loaded.
             // But useChat doesn't have ref to scrollContainer.
             // Wait, useChat's loadOlderMessages does NOT handle scroll position maintenance because it doesn't have the ref.
             // I need to handle it here.
           }
        })
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

  // Handle scroll position maintenance when loading older messages
  // Since useChat updates messages state, we can use useLayoutEffect to adjust scroll
  // But we need to know if it was a "load older" update.
  // We can check if the first message changed and we are not at the top?
  // Or we can wrap loadOlderMessages to capture scroll height before and after.
  // But loadOlderMessages is async and updates state.
  // The state update triggers re-render.
  // In useChat, loadOlderMessages updates state.
  // We can use useLayoutEffect to detect if messages were prepended.
  
  const previousFirstMessageIdRef = useRef<string | null>(null)
  const previousScrollHeightRef = useRef<number>(0)
  
  useLayoutEffect(() => {
     if (messages.length > 0) {
        const firstMsg = messages[0]
        if (previousFirstMessageIdRef.current && firstMsg.id !== previousFirstMessageIdRef.current) {
           // Messages prepended?
           // Check if we were loading more
           // Actually, we can just check if the first message changed.
           // But we need to adjust scroll position.
           const scrollEl = scrollContainerRef.current
           if (scrollEl && previousScrollHeightRef.current > 0) {
              const newScrollHeight = scrollEl.scrollHeight
              const heightDelta = newScrollHeight - previousScrollHeightRef.current
              if (heightDelta > 0) {
                 scrollEl.scrollTop = scrollEl.scrollTop + heightDelta
              }
           }
        }
        previousFirstMessageIdRef.current = firstMsg.id
        if (scrollContainerRef.current) {
           previousScrollHeightRef.current = scrollContainerRef.current.scrollHeight
        }
     }
  }, [messages])


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
      } else {
        setPendingNewMessagesCount(c => c + 1)
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
    await sendMessage(newMessage)
    inputRef.current?.focus()
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
  const immersiveMobile = Boolean(isImmersiveMobile && isMobile)
  const headerClassName = cn(
    'relative sticky z-40 flex items-center gap-3 border-b border-gray-200 bg-white pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] shadow-sm transition-colors md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))]',
    immersiveMobile
      ? 'top-0 py-3.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70'
      : isMobile
      ? 'top-[calc(var(--app-header-offset,0px))] py-3.5 pt-[calc(env(safe-area-inset-top)+0.75rem)] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70'
      : 'top-0 py-4',
    'md:top-0'
  )
  const messageListClassName = cn(
    'min-h-0 overflow-y-auto overscroll-contain pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))]',
    immersiveMobile
      ? 'pt-5 pb-[calc(var(--chat-composer-height,72px)+var(--chat-safe-area-bottom,0px)+1rem)]'
      : isMobile
      ? 'pt-6 pb-[calc(var(--chat-composer-height,72px)+var(--chat-safe-area-bottom,0px)+0.25rem)]'
      : 'pt-6 pb-20 md:pb-16'
  )
  const composerClassName = cn(
    'border-t border-gray-200 bg-white/95 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-3.5 backdrop-blur transition md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] md:static',
    isMobile
      ? 'fixed bottom-0 left-0 right-0 z-40 shadow-lg pb-[calc(0.75rem+var(--chat-safe-area-bottom,0px))]'
      : 'relative'
  )
  const chatGridClassName = cn(
    'grid h-full w-full min-h-0 grid-rows-[auto,1fr,auto] overflow-hidden',
    immersiveMobile ? 'bg-white' : 'bg-gray-50',
    isMobile ? 'pb-[var(--chat-safe-area-bottom,0px)]' : ''
  )

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
    <div className={chatGridClassName}>
      <div className={headerClassName}>
        {isMobile && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gray-200/60 to-transparent"
          />
        )}
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

      <div ref={scrollContainerRef} className={messageListClassName}>
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
            <div className="relative">
              <div
                className="relative w-full"
                style={{ height: messageVirtualizer.getTotalSize() }}
              >
                {messageVirtualizer.getVirtualItems().map(virtualRow => {
                  const message = messages[virtualRow.index]
                  if (!message) {
                    return null
                  }

                  const isMyMessage = message.sender_id === currentUserId
                  const isPending = message.id.startsWith('optimistic-')
                  const previousMessage = virtualRow.index > 0 ? messages[virtualRow.index - 1] : null
                  const showTimestamp =
                    virtualRow.index === 0 ||
                    (previousMessage &&
                      new Date(message.sent_at).getTime() - new Date(previousMessage.sent_at).getTime() > 300000)
                  const isUnreadMarker =
                    shouldRenderUnreadSeparator &&
                    unreadMetadata.firstUnreadId === message.id &&
                    !isMyMessage

                  return (
                    <div
                      key={message.id}
                      ref={setMessageRef(message.id)}
                      data-message-id={message.id}
                      data-index={virtualRow.index}
                      className="absolute left-0 w-full"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        top: 0,
                      }}
                    >
                      <div className="pb-4">
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
                    </div>
                  )
                })}
              </div>
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
        className={composerClassName}
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
