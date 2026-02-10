import { useState, useCallback, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useUserPosts, type PostImage } from '@/hooks/useUserPosts'
import { validateImage, optimizeImage } from '@/lib/imageOptimization'
import { logger } from '@/lib/logger'
import { Avatar } from '@/components'
import { PostImageUploader, type UploadedImage } from './PostImageUploader'
import type { HomeFeedItem, UserPostFeedItem } from '@/types/homeFeed'

interface PostComposerModalProps {
  isOpen: boolean
  onClose: () => void
  onPostCreated: (item: HomeFeedItem) => void
  editingPost?: { id: string; content: string; images: PostImage[] | null } | null
}

const MAX_CONTENT_LENGTH = 2000
const BUCKET = 'user-posts'

export function PostComposerModal({
  isOpen,
  onClose,
  onPostCreated,
  editingPost,
}: PostComposerModalProps) {
  const { user, profile } = useAuthStore()
  const { createPost, updatePost } = useUserPosts()
  const isEdit = Boolean(editingPost)
  const dialogRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useFocusTrap({ containerRef: dialogRef, isActive: isOpen })

  const [content, setContent] = useState('')
  const [images, setImages] = useState<UploadedImage[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) return

    if (editingPost) {
      setContent(editingPost.content)
      setImages(
        editingPost.images
          ? editingPost.images.map((img, i) => ({ url: img.url, order: i }))
          : []
      )
    } else {
      setContent('')
      setImages([])
    }
    setError(null)

    // Auto-focus textarea
    setTimeout(() => textareaRef.current?.focus(), 100)
  }, [isOpen, editingPost])

  // Auto-resize textarea
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setError(null)

    // Auto-resize
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  const handleImageAdd = useCallback(async (file: File) => {
    if (!user) return

    setIsUploading(true)
    setError(null)

    try {
      const validation = validateImage(file, { maxFileSizeMB: 10 })
      if (!validation.valid) {
        throw new Error(validation.error)
      }

      const optimized = await optimizeImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        maxSizeMB: 1,
        quality: 0.85,
      })

      const ext = optimized.type === 'image/png' ? 'png' : 'jpg'
      const random = Math.random().toString(36).slice(2, 8)
      const fileName = `${user.id}/${Date.now()}_${random}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, optimized, {
          contentType: optimized.type,
          upsert: false,
        })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(fileName)

      setImages(prev => [...prev, { url: urlData.publicUrl, order: prev.length }])
    } catch (err) {
      logger.error('[PostComposerModal] Image upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image')
    } finally {
      setIsUploading(false)
    }
  }, [user])

  const handleImageRemove = useCallback((index: number) => {
    setImages(prev => prev
      .filter((_, i) => i !== index)
      .map((img, i) => ({ ...img, order: i }))
    )
  }, [])

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return

    const trimmed = content.trim()

    if (!trimmed) {
      setError('Post content is required')
      return
    }

    if (trimmed.length > MAX_CONTENT_LENGTH) {
      setError(`Content exceeds ${MAX_CONTENT_LENGTH} character limit`)
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const postImages = images.length > 0 ? images : null

      if (isEdit && editingPost) {
        const result = await updatePost(editingPost.id, trimmed, postImages)
        if (!result.success) {
          throw new Error(result.error || 'Failed to update post')
        }
      } else {
        const result = await createPost(trimmed, postImages)
        if (!result.success) {
          throw new Error(result.error || 'Failed to create post')
        }

        // Create a local feed item for optimistic prepend
        if (result.post_id && profile) {
          const newItem: UserPostFeedItem = {
            feed_item_id: result.post_id,
            item_type: 'user_post',
            created_at: new Date().toISOString(),
            post_id: result.post_id,
            author_id: profile.id,
            author_name: profile.full_name,
            author_avatar: profile.avatar_url,
            author_role: profile.role as 'player' | 'coach' | 'club' | 'brand',
            content: trimmed,
            images: postImages,
            like_count: 0,
            comment_count: 0,
            has_liked: false,
          }
          onPostCreated(newItem)
        }
      }

      setContent('')
      setImages([])
      onClose()
    } catch (err) {
      logger.error('[PostComposerModal] Submit error:', err)
      setError(err instanceof Error ? err.message : 'Failed to save post')
    } finally {
      setIsSubmitting(false)
    }
  }, [content, images, isEdit, editingPost, createPost, updatePost, profile, onPostCreated, onClose, isSubmitting])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="post-composer-title"
          tabIndex={-1}
          className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto focus:outline-none"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 id="post-composer-title" className="text-xl font-semibold text-gray-900">
              {isEdit ? 'Edit Post' : 'Create Post'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            {/* Author info */}
            {profile && (
              <div className="flex items-center gap-3">
                <Avatar
                  src={profile.avatar_url}
                  initials={profile.full_name?.slice(0, 2) || '?'}
                  size="md"
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{profile.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Textarea */}
            <div>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                placeholder="What's on your mind?"
                rows={4}
                maxLength={MAX_CONTENT_LENGTH}
                className="w-full px-0 py-2 text-gray-900 text-base placeholder-gray-400 border-0 focus:outline-none focus:ring-0 resize-none"
                style={{ minHeight: '100px' }}
              />
              <div className="flex justify-end">
                <span className={`text-xs ${content.length > MAX_CONTENT_LENGTH - 200 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {content.length}/{MAX_CONTENT_LENGTH}
                </span>
              </div>
            </div>

            {/* Image uploader */}
            <PostImageUploader
              images={images}
              onAdd={handleImageAdd}
              onRemove={handleImageRemove}
              isUploading={isUploading}
            />

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || isUploading || !content.trim()}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSubmitting ? 'Posting...' : isEdit ? 'Save Changes' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
