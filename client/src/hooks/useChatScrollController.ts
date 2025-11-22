import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

interface UseChatScrollControllerOptions {
  hasMore: boolean
  isLoadingMore: boolean
  loadOlderMessages: () => Promise<boolean>
  onReachBottom?: () => void
  onBeforeLoadOlder?: () => void
  scrollContainerRef?: MutableRefObject<HTMLDivElement | null>
  onScrollMetricsChange?: (metrics: { distanceFromBottom: number }) => void
}

export function useChatScrollController({
  hasMore,
  isLoadingMore,
  loadOlderMessages,
  onReachBottom,
  onBeforeLoadOlder,
  scrollContainerRef: externalScrollRef,
  onScrollMetricsChange
}: UseChatScrollControllerOptions) {
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = externalScrollRef ?? internalScrollRef
  const isAutoScrollingRef = useRef(false)
  const distanceFromBottomRef = useRef(0)

  const readDistanceFromBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return 0
    }

    return container.scrollHeight - (container.scrollTop + container.clientHeight)
  }, [scrollContainerRef])

  const notifyScrollMetrics = useCallback(() => {
    const distance = readDistanceFromBottom()
    distanceFromBottomRef.current = distance
    onScrollMetricsChange?.({ distanceFromBottom: distance })
    return distance
  }, [onScrollMetricsChange, readDistanceFromBottom])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    isAutoScrollingRef.current = true
    
    // Use requestAnimationFrame for smoother scroll
    requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior })
    })

    const finalize = () => {
      isAutoScrollingRef.current = false
      notifyScrollMetrics()
    }

    if (behavior === 'auto') {
      requestAnimationFrame(finalize)
    } else {
      window.setTimeout(finalize, 200)
    }
  }, [notifyScrollMetrics, scrollContainerRef])

  const isViewerAtBottom = useCallback(() => {
    const distanceFromBottom = readDistanceFromBottom()
    return distanceFromBottom <= 150
  }, [readDistanceFromBottom])

  const getDistanceFromBottom = useCallback(() => distanceFromBottomRef.current, [])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) {
      return
    }

    let ticking = false

    const handleScroll = () => {
      if (isAutoScrollingRef.current || ticking) {
        return
      }

      ticking = true
      requestAnimationFrame(() => {
        if (container.scrollTop < 120 && hasMore && !isLoadingMore) {
          onBeforeLoadOlder?.()
          void loadOlderMessages()
        }

        notifyScrollMetrics()

        if (isViewerAtBottom()) {
          onReachBottom?.()
        }

        ticking = false
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    notifyScrollMetrics()

    return () => {
      container.removeEventListener('scroll', handleScroll)
    }
  }, [hasMore, isLoadingMore, isViewerAtBottom, loadOlderMessages, notifyScrollMetrics, onBeforeLoadOlder, onReachBottom, scrollContainerRef])

  return {
    scrollContainerRef,
    isAutoScrollingRef,
    isViewerAtBottom,
    scrollToBottom,
    getDistanceFromBottom
  }
}
