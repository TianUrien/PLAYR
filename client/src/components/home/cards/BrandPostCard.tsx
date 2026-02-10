import { Link } from 'react-router-dom'
import { Store, BadgeCheck } from 'lucide-react'
import { getTimeAgo } from '@/lib/utils'
import type { BrandPostFeedItem } from '@/types/homeFeed'

interface BrandPostCardProps {
  item: BrandPostFeedItem
}

export function BrandPostCard({ item }: BrandPostCardProps) {
  const timeAgo = getTimeAgo(item.created_at, true)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-5">
        {/* Brand Header */}
        <Link
          to={`/brands/${item.brand_slug}`}
          className="flex items-center gap-3 mb-4 group"
        >
          {item.brand_logo_url ? (
            <img
              src={item.brand_logo_url}
              alt={item.brand_name || ''}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Store className="w-5 h-5 text-gray-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                {item.brand_name}
              </span>
              {item.brand_is_verified && (
                <BadgeCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
              )}
              {item.brand_category && (
                <span className="text-xs text-gray-400 flex-shrink-0">&middot; {item.brand_category}</span>
              )}
            </div>
            <p className="text-xs text-gray-400">{timeAgo}</p>
          </div>
        </Link>

        {/* Post Content */}
        {item.post_content && (
          <p className="text-gray-800 mb-4 whitespace-pre-line">
            {item.post_content}
          </p>
        )}

        {/* Post Image */}
        {item.post_image_url && (
          <div className="rounded-lg overflow-hidden -mx-1">
            <img
              src={item.post_image_url}
              alt=""
              className="w-full h-auto max-h-96 object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </div>
  )
}
