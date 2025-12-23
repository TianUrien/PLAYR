import { useState, useEffect, useRef, useCallback, useId, useLayoutEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from 'react-router-dom'
import { Send, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUPABASE_URL } from '@/lib/supabase'
import { format } from 'date-fns'
import { ChatWindowSkeleton } from './Skeleton'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useChat } from '@/hooks/useChat'
import { useSafeArea } from '@/hooks/useSafeArea'
import { useChatScrollController } from '@/hooks/useChatScrollController'
import type { Conversation, ChatMessageEvent, ConversationParticipant } from '@/types/chat'

const COMPOSER_MIN_HEIGHT = 48
const COMPOSER_MAX_HEIGHT = 160

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

  useSafeArea()

  const headerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLFormElement>(null)
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const handleReachBottom = useCallback(() => {
    setPendingNewMessagesCount(0)
    markConversationAsRead()
  }, [markConversationAsRead])
  const { scrollContainerRef, isAutoScrollingRef, isViewerAtBottom, scrollToBottom } = useChatScrollController({
    hasMore: hasMoreMessages,
    isLoadingMore,
    loadOlderMessages,
    onReachBottom: handleReachBottom
  })
  const scrollToBottomWithRaf = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (typeof window === 'undefined') {
      scrollToBottom(behavior)
      return
    }

    window.requestAnimationFrame(() => {
      scrollToBottom(behavior)
    })
  }, [scrollToBottom])
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 12
  })
  
  const lastMessageIdRef = useRef<string | null>(null)
  const messageRefs = useRef(new Map<string, HTMLDivElement>())
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null)
  const textareaId = useId()
  const textareaCharCountId = `${textareaId}-counter`
  const hasScrolledToFirstUnreadRef = useRef(false)

  useEffect(() => {
    setPendingNewMessagesCount(0)
    lastMessageIdRef.current = null
  }, [conversation.id])


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
  }, [conversation.id, messages, queueReadReceipt, scrollContainerRef])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement

    const updateComposerHeight = () => {
      if (!composerRef.current) {
        return
      }
      root.style.setProperty('--chat-composer-height', `${composerRef.current.getBoundingClientRect().height}px`)
    }

    updateComposerHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateComposerHeight)
      window.addEventListener('orientationchange', updateComposerHeight)

      return () => {
        window.removeEventListener('resize', updateComposerHeight)
        window.removeEventListener('orientationchange', updateComposerHeight)
        root.style.removeProperty('--chat-composer-height')
      }
    }

    const observer = new ResizeObserver(updateComposerHeight)
    if (composerRef.current) {
      observer.observe(composerRef.current)
    }

    return () => {
      observer.disconnect()
      root.style.removeProperty('--chat-composer-height')
    }
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const root = document.documentElement

    const updateHeaderHeight = () => {
      if (!headerRef.current) {
        return
      }
      root.style.setProperty('--chat-header-height', `${headerRef.current.getBoundingClientRect().height}px`)
    }

    updateHeaderHeight()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateHeaderHeight)
      window.addEventListener('orientationchange', updateHeaderHeight)

      return () => {
        window.removeEventListener('resize', updateHeaderHeight)
        window.removeEventListener('orientationchange', updateHeaderHeight)
        root.style.removeProperty('--chat-header-height')
      }
    }

    const observer = new ResizeObserver(updateHeaderHeight)
    if (headerRef.current) {
      observer.observe(headerRef.current)
    }

    return () => {
      observer.disconnect()
      root.style.removeProperty('--chat-header-height')
    }
  }, [])

  const handleJumpToLatest = useCallback(() => {
    setPendingNewMessagesCount(0)
    scrollToBottomWithRaf('smooth')
    markConversationAsRead({ immediate: true })
  }, [markConversationAsRead, scrollToBottomWithRaf])

  useEffect(() => {
    hasScrolledToFirstUnreadRef.current = false
  }, [conversation.id])

  // Scroll management effect
  useLayoutEffect(() => {
    if (!messages.length) {
      lastMessageIdRef.current = null
      return
    }

    const latestMessage = messages[messages.length - 1]
    const latestId = latestMessage.id
    const previousLastId = lastMessageIdRef.current
    
    // Initial load
    if (previousLastId === null) {
      scrollToBottomWithRaf('auto')
      lastMessageIdRef.current = latestId
      return
    }

    // New message arrived
    if (latestId !== previousLastId) {
      const isMyMessage = latestMessage.sender_id === currentUserId
      
      if (isMyMessage) {
        // Always scroll to bottom for my own messages
        scrollToBottomWithRaf('smooth')
        setPendingNewMessagesCount(0)
      } else {
        // For others' messages, only scroll if we were already at bottom
        if (isViewerAtBottom()) {
          scrollToBottomWithRaf('smooth')
          setPendingNewMessagesCount(0)
          markConversationAsRead()
        } else {
          setPendingNewMessagesCount(c => c + 1)
        }
      }
      lastMessageIdRef.current = latestId
    }
  }, [messages, currentUserId, isViewerAtBottom, markConversationAsRead, scrollToBottomWithRaf])

  // Maintain scroll position when loading older messages
  const previousFirstMessageIdRef = useRef<string | null>(null)
  const previousScrollHeightRef = useRef<number>(0)
  
  useLayoutEffect(() => {
     if (messages.length > 0) {
        const firstMsg = messages[0]
        if (previousFirstMessageIdRef.current && firstMsg.id !== previousFirstMessageIdRef.current) {
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
  }, [messages, scrollContainerRef])

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
  const mobileHeaderOffsetClass = immersiveMobile ? 'top-0' : 'top-[calc(var(--app-header-offset,0px))]'
  const headerClassName = cn(
    'z-40 flex items-center gap-3 border-b border-gray-200 bg-white pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] shadow-sm transition-colors md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))]',
    isMobile
      ? `fixed left-0 right-0 pb-3.5 ${mobileHeaderOffsetClass} bg-white/95 pt-[calc(var(--chat-safe-area-top,0px)+0.75rem)] backdrop-blur supports-[backdrop-filter]:bg-white/70`
      : 'relative sticky top-0 py-4'
  )
  const messageListClassName = cn(
    'min-h-0 h-full overflow-y-auto overscroll-contain pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))]',
    isMobile
      ? 'bg-white h-[calc(100dvh-var(--chat-header-height,72px)-var(--chat-composer-height,72px))] pt-[calc(var(--chat-header-height,72px)+0.75rem)] pb-[calc(var(--chat-composer-height,72px)+var(--chat-safe-area-bottom,0px)+0.75rem)]'
      : 'pt-6 pb-20 md:pb-16'
  )
  const composerClassName = cn(
    'border-t border-gray-200 bg-white/95 pl-4 pr-[calc(1rem+var(--chat-safe-area-right,0px))] py-3.5 backdrop-blur transition md:pl-6 md:pr-[calc(1.5rem+var(--chat-safe-area-right,0px))] md:static',
    isMobile
      ? 'fixed bottom-0 left-0 right-0 z-40 w-full shadow-lg pb-[calc(0.75rem+var(--chat-safe-area-bottom,0px))]'
      : 'relative'
  )
  const chatGridClassName = cn(
    'grid h-full w-full min-h-0 grid-rows-[auto,1fr,auto] overflow-hidden',
    isMobile ? 'min-h-[100dvh] bg-white' : immersiveMobile ? 'bg-white' : 'bg-gray-50',
    isMobile ? 'pb-[var(--chat-safe-area-bottom,0px)]' : ''
  )

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

  useEffect(() => {
    if (hasScrolledToFirstUnreadRef.current) {
      return
    }

    if (unreadMetadata.unreadCount === 0) {
      return
    }

    if (unreadMetadata.firstUnreadIndex < 0) {
      return
    }

    if (isViewerAtBottom()) {
      hasScrolledToFirstUnreadRef.current = true
      return
    }

    hasScrolledToFirstUnreadRef.current = true

    if (typeof window === 'undefined') {
      return
    }

    isAutoScrollingRef.current = true
    messageVirtualizer.scrollToIndex(unreadMetadata.firstUnreadIndex, { align: 'center' })

    window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, 150)
  }, [
    isAutoScrollingRef,
    isViewerAtBottom,
    messageVirtualizer,
    unreadMetadata.firstUnreadIndex,
    unreadMetadata.unreadCount
  ])

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
  const isOverLimit = newMessage.length > 1000
  const isSendDisabled = !canSend || sending || isOverLimit



  return (
    <div className={chatGridClassName}>
      <div ref={headerRef} className={headerClassName}>
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <RoleBadge role={conversation.otherParticipant?.role ?? 'member'} className="md:text-sm" />
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className={messageListClassName}
      >
        {messages.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center text-center text-gray-500">
            No messages yet. Start the conversation!
          </div>
        ) : (
          <>
            {isLoadingMore && (
              <div className="flex justify-center pb-4 text-xs font-medium uppercase tracking-wide text-gray-400">
                Loading earlier messages...
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
        ref={composerRef}
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
                scrollToBottomWithRaf('smooth')
                setPendingNewMessagesCount(0)
                markConversationAsRead()
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
              className={`pointer-events-none absolute bottom-2 right-3 text-xs font-medium md:bottom-2.5 md:right-3 transition-colors ${
                newMessage.length >= 1000 ? 'text-red-500 font-semibold' : newMessage.length >= 900 ? 'text-amber-500' : 'text-gray-400'
              }`}
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
