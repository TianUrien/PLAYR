/**
 * GlobalBrandFeed
 *
 * Unified feed showing products and posts from all brands.
 * Displays items in reverse-chronological order with infinite scroll.
 */

import { useRef, useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Rss, Store, ExternalLink, CheckCircle, ArrowRight } from 'lucide-react'
import { useBrandFeed, type FeedItem, type ProductFeedItem, type PostFeedItem } from '@/hooks/useBrandFeed'
import type { ProductImage } from '@/hooks/useBrandProducts'
import Skeleton from '@/components/Skeleton'

export function GlobalBrandFeed() {
  const { items, isLoading, error, hasMore, loadMore } = useBrandFeed()

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <FeedSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        {error}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <Rss className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No activity yet
        </h3>
        <p className="text-gray-500">
          When brands add products or share updates, they'll appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {items.map(item => (
        <FeedCard key={`${item.type}-${item.id}`} item={item} />
      ))}

      {/* Load More */}
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

      {isLoading && items.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      )}
    </div>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  if (item.type === 'product') {
    return <ProductFeedCard item={item} />
  }
  return <PostFeedCard item={item} />
}

// --------------------------------------------------------------------------
// Product Feed Card
// --------------------------------------------------------------------------
function ProductFeedCard({ item }: { item: ProductFeedItem }) {
  const images = Array.isArray(item.product_images)
    ? [...item.product_images].sort((a, b) => a.order - b.order)
    : []
  const externalUrl = item.product_external_url || null
  const timeAgo = getTimeAgo(item.created_at)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Brand header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <Link to={`/brands/${item.brand_slug}`} className="flex-shrink-0">
          {item.brand_logo_url ? (
            <img
              src={item.brand_logo_url}
              alt={item.brand_name}
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/brands/${item.brand_slug}`}
              className="font-semibold text-gray-900 truncate hover:text-indigo-600 transition-colors"
            >
              {item.brand_name}
            </Link>
            {item.brand_is_verified && (
              <CheckCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500">Added a product &middot; {timeAgo}</p>
        </div>
      </div>

      {/* Product image carousel */}
      {images.length > 0 && (
        <FeedImageCarousel images={images} altPrefix={item.product_name} />
      )}

      {/* Product info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-1">{item.product_name}</h3>
        {item.product_description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{item.product_description}</p>
        )}

        {externalUrl && (
          <a
            href={externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            Learn more
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* View brand footer */}
      <div className="px-4 pb-3 pt-1 border-t border-gray-100">
        <Link
          to={`/brands/${item.brand_slug}`}
          className="text-sm text-gray-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1"
        >
          View brand
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Post Feed Card
// --------------------------------------------------------------------------
function PostFeedCard({ item }: { item: PostFeedItem }) {
  const timeAgo = getTimeAgo(item.created_at)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Brand header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <Link to={`/brands/${item.brand_slug}`} className="flex-shrink-0">
          {item.brand_logo_url ? (
            <img
              src={item.brand_logo_url}
              alt={item.brand_name}
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
              <Store className="w-5 h-5 text-gray-400" />
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={`/brands/${item.brand_slug}`}
              className="font-semibold text-gray-900 truncate hover:text-indigo-600 transition-colors"
            >
              {item.brand_name}
            </Link>
            {item.brand_is_verified && (
              <CheckCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-gray-500">{timeAgo}</p>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-gray-800 whitespace-pre-wrap">{item.post_content}</p>
      </div>

      {/* Image */}
      {item.post_image_url && (
        <div className="px-4 pb-4">
          <img
            src={item.post_image_url}
            alt="Post image"
            className="w-full rounded-lg object-cover max-h-[400px]"
            loading="lazy"
          />
        </div>
      )}

      {/* View brand footer */}
      <div className="px-4 pb-3 pt-1 border-t border-gray-100">
        <Link
          to={`/brands/${item.brand_slug}`}
          className="text-sm text-gray-500 hover:text-indigo-600 transition-colors inline-flex items-center gap-1"
        >
          View brand
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Feed Image Carousel (for products)
// --------------------------------------------------------------------------
function FeedImageCarousel({ images, altPrefix }: { images: ProductImage[]; altPrefix: string }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [currentSlide, setCurrentSlide] = useState(0)

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || images.length <= 1) return
    const index = Math.round(el.scrollLeft / el.offsetWidth)
    setCurrentSlide(index)
  }, [images.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none]"
      >
        {images.map((img, i) => (
          <div key={i} className="flex-shrink-0 w-full snap-start">
            <div className="aspect-[4/3] bg-gray-100">
              <img
                src={img.url}
                alt={`${altPrefix} - image ${i + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2 bg-white">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to image ${i + 1}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentSlide ? 'bg-indigo-500' : 'bg-gray-300'
              }`}
              onClick={() => {
                scrollRef.current?.scrollTo({
                  left: i * (scrollRef.current?.offsetWidth ?? 0),
                  behavior: 'smooth',
                })
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------------
// Skeleton loader
// --------------------------------------------------------------------------
function FeedSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton width="40%" height={16} />
          <Skeleton width="25%" height={12} />
        </div>
      </div>
      <Skeleton width="100%" height={250} />
      <div className="p-4 space-y-2">
        <Skeleton width="60%" height={18} />
        <Skeleton width="100%" height={14} />
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Utils
// --------------------------------------------------------------------------
function getTimeAgo(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
