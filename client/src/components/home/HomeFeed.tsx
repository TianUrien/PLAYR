import { Component, useEffect, useRef } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Loader2, Rss } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { HomeFeedItemCard } from './HomeFeedItemCard'
import { FeedSkeleton } from './FeedSkeleton'
import { PostComposer } from './PostComposer'

/**
 * Lightweight error boundary for individual feed items.
 * If one card crashes (e.g. Chrome auto-translate corrupting the DOM),
 * only that card is hidden — the rest of the feed stays alive.
 */
class FeedItemErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack, context: 'FeedItemErrorBoundary' },
    })
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export function HomeFeed() {
  const { items, isLoading, isFetchingNextPage, error, refetch, hasMore, loadMore, updateItemLike, removeItem, prependItem } = useHomeFeed()
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingNextPage) {
          void loadMore()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isFetchingNextPage, loadMore])

  return (
    <div>
      {/* Post composer — visually separated from feed */}
      <div className="mb-8">
        <PostComposer onPostCreated={prependItem} />
      </div>

      {/* Loading state */}
      {isLoading && items.length === 0 && (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <FeedSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-lg text-red-600">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 px-4 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && items.length === 0 && (
        <div className="text-center py-12">
          <Rss className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No activity yet
          </h3>
          <p className="text-gray-500">
            When members join, post opportunities, or achieve milestones, they'll appear here.
          </p>
        </div>
      )}

      {/* Feed items */}
      {items.length > 0 && (
        <div className="space-y-6">
          {items.map(item => (
            <FeedItemErrorBoundary key={item.feed_item_id}>
              <HomeFeedItemCard
                item={item}
                onLikeUpdate={updateItemLike}
                onDelete={removeItem}
              />
            </FeedItemErrorBoundary>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} />}

      {/* Pagination loading */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-[#8026FA] animate-spin" />
        </div>
      )}
    </div>
  )
}
