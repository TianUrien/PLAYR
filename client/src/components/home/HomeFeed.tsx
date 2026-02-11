import { useRef, useCallback, useEffect } from 'react'
import { Loader2, Rss } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { HomeFeedItemCard } from './HomeFeedItemCard'
import { FeedSkeleton } from './FeedSkeleton'
import { PostComposer } from './PostComposer'

export function HomeFeed() {
  const { items, isLoading, error, refetch, hasMore, loadMore, updateItemLike, removeItem, prependItem } = useHomeFeed()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const prevItemCountRef = useRef(items.length)

  const feedVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 220,
    overscan: 5,
    getItemKey: (index) => items[index]?.feed_item_id ?? index,
  })

  // Recalculate virtualizer measurements when items are added/removed
  useEffect(() => {
    if (items.length !== prevItemCountRef.current) {
      prevItemCountRef.current = items.length
      feedVirtualizer.measure()
    }
  }, [items.length, feedVirtualizer])

  const handleLoadMore = useCallback(() => {
    void loadMore()
  }, [loadMore])

  // Non-virtualized layout when few items (simpler for empty/loading states)
  const shouldVirtualize = items.length > 10

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

      {/* Feed items — virtualized for large lists, plain map for small */}
      {shouldVirtualize ? (
        <div
          ref={scrollContainerRef}
          style={{ height: '100%', overflow: 'auto' }}
        >
          <div
            style={{
              height: `${feedVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {feedVirtualizer.getVirtualItems().map(virtualItem => (
              <div
                key={items[virtualItem.index].feed_item_id}
                data-index={virtualItem.index}
                ref={feedVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="pb-6">
                  <HomeFeedItemCard
                    item={items[virtualItem.index]}
                    onLikeUpdate={updateItemLike}
                    onDelete={removeItem}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map(item => (
            <HomeFeedItemCard
              key={item.feed_item_id}
              item={item}
              onLikeUpdate={updateItemLike}
              onDelete={removeItem}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="text-center pt-6">
          <button
            onClick={handleLoadMore}
            className="px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {/* Pagination loading */}
      {isLoading && items.length > 0 && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-6 h-6 text-[#8026FA] animate-spin" />
        </div>
      )}
    </div>
  )
}
