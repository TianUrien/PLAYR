import { useCallback, useEffect, useRef } from 'react'

interface UseChatScrollControllerOptions {
  hasMore: boolean
  isLoadingMore: boolean
  loadOlderMessages: () => Promise<boolean>
  onReachBottom?: () => void
}

export function useChatScrollController({
  hasMore,
  isLoadingMore,
  loadOlderMessages,
  onReachBottom
}: UseChatScrollControllerOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAutoScrollingRef = useRef(false)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    isAutoScrollingRef.current = true
    container.scrollTo({ top: container.scrollHeight, behavior })

    window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, behavior === 'auto' ? 0 : 150)
  }, [])

  const isViewerAtBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return true
    }

    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight)
    return distanceFromBottom <= 150
  }, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    const handleScroll = () => {
      if (isAutoScrollingRef.current) {
        return
      }

      if (container.scrollTop < 120 && hasMore && !isLoadingMore) {
        void loadOlderMessages()
      }

      if (isViewerAtBottom()) {
        onReachBottom?.()
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoadingMore, isViewerAtBottom, loadOlderMessages, onReachBottom])

  return {
    scrollContainerRef,
    isAutoScrollingRef,
    isViewerAtBottom,
    scrollToBottom
  }
}
