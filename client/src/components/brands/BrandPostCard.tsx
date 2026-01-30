/**
 * BrandPostCard
 *
 * Displays a brand post (announcement) in the feed.
 * Supports owner mode with edit/delete actions.
 */

import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Pencil, Trash2, CheckCircle, Store } from 'lucide-react'
import type { BrandPost } from '@/hooks/useBrandPosts'

interface BrandPostCardProps {
  post: BrandPost
  /** Brand info for feed display */
  brandName?: string
  brandSlug?: string
  brandLogoUrl?: string | null
  brandIsVerified?: boolean
  isOwner?: boolean
  onEdit?: (post: BrandPost) => void
  onDelete?: (post: BrandPost) => void
}

export function BrandPostCard({
  post,
  brandName,
  brandSlug,
  brandLogoUrl,
  brandIsVerified,
  isOwner = false,
  onEdit,
  onDelete,
}: BrandPostCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const close = () => setShowMenu(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [showMenu])

  const timeAgo = getTimeAgo(post.created_at)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Brand header */}
      {brandName && brandSlug && (
        <div className="flex items-center gap-3 p-4 pb-0">
          <Link to={`/brands/${brandSlug}`} className="flex-shrink-0">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={brandName}
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
                to={`/brands/${brandSlug}`}
                className="font-semibold text-gray-900 truncate hover:text-indigo-600 transition-colors"
              >
                {brandName}
              </Link>
              {brandIsVerified && (
                <CheckCircle className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-gray-500">{timeAgo}</p>
          </div>

          {/* Owner menu */}
          {isOwner && (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowMenu(!showMenu)
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onEdit?.(post)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false)
                      onDelete?.(post)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <p className="text-gray-800 whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Image */}
      {post.image_url && (
        <div className="px-4 pb-4">
          <img
            src={post.image_url}
            alt="Post image"
            className="w-full rounded-lg object-cover max-h-[400px]"
            loading="lazy"
          />
        </div>
      )}
    </div>
  )
}

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
