import { useCallback, useState } from 'react'
import { Heart, MessageCircle, Share2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'

interface PostInteractionBarProps {
  postId: string
  likeCount: number
  commentCount: number
  hasLiked: boolean
  onToggleLike: () => Promise<void>
  onToggleComments: () => void
  showComments: boolean
}

export function PostInteractionBar({
  postId,
  likeCount,
  commentCount,
  hasLiked,
  onToggleLike,
  onToggleComments,
  showComments,
}: PostInteractionBarProps) {
  const { user } = useAuthStore()
  const [isLiking, setIsLiking] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleLike = useCallback(async () => {
    if (!user || isLiking) return
    setIsLiking(true)
    try {
      await onToggleLike()
    } finally {
      setIsLiking(false)
    }
  }, [user, isLiking, onToggleLike])

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/home?post=${postId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [postId])

  return (
    <div>
      {/* Counts row */}
      {(likeCount > 0 || commentCount > 0) && (
        <div className="flex items-center justify-between px-4 py-1.5 text-xs text-gray-500">
          <span>
            {likeCount > 0 && `${likeCount} like${likeCount !== 1 ? 's' : ''}`}
          </span>
          <button
            type="button"
            onClick={onToggleComments}
            className="hover:text-gray-700 hover:underline"
          >
            {commentCount > 0 && `${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center border-t border-gray-100">
        <button
          type="button"
          onClick={handleLike}
          disabled={!user || isLiking}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            hasLiked
              ? 'text-[#8026FA]'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } disabled:opacity-50`}
        >
          <Heart
            className={`w-4.5 h-4.5 ${hasLiked ? 'fill-[#8026FA]' : ''}`}
          />
          <span>Like</span>
        </button>

        <button
          type="button"
          onClick={onToggleComments}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            showComments
              ? 'text-[#8026FA]'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <MessageCircle className="w-4.5 h-4.5" />
          <span>Comment</span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Share2 className="w-4.5 h-4.5" />
          <span>{copied ? 'Copied!' : 'Share'}</span>
        </button>
      </div>
    </div>
  )
}
