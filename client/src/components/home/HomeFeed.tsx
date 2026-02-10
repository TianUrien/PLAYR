import { Loader2, Rss } from 'lucide-react'
import { useHomeFeed } from '@/hooks/useHomeFeed'
import { HomeFeedItemCard } from './HomeFeedItemCard'
import { FeedSkeleton } from './FeedSkeleton'
import { PostComposer } from './PostComposer'

export function HomeFeed() {
  const { items, isLoading, error, hasMore, loadMore, updateItemLike, removeItem, prependItem } = useHomeFeed()

  return (
    <div className="space-y-4">
      {/* Post composer (only shown when authenticated, handled internally) */}
      <PostComposer onPostCreated={prependItem} />

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
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
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
      {items.map(item => (
        <HomeFeedItemCard
          key={item.feed_item_id}
          item={item}
          onLikeUpdate={updateItemLike}
          onDelete={removeItem}
        />
      ))}

      {/* Load more */}
      {hasMore && !isLoading && (
        <div className="text-center pt-4">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {/* Pagination loading */}
      {isLoading && items.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      )}
    </div>
  )
}
