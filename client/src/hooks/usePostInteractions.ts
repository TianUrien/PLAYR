import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { withTimeout } from '@/lib/retry'
import type { PostComment } from '@/types/homeFeed'

interface LikeResult {
  success: boolean
  liked?: boolean
  like_count?: number
  error?: string
}

interface CommentsResult {
  comments: PostComment[]
  total: number
}

interface CommentCreateResult {
  success: boolean
  comment_id?: string
  error?: string
}

interface SimpleResult {
  success: boolean
  error?: string
}

export function usePostInteractions() {
  const toggleLike = useCallback(async (postId: string): Promise<LikeResult> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await withTimeout(
        async () => await (supabase.rpc as any)('toggle_post_like', {
          p_post_id: postId,
        }),
        10_000
      )

      if (error) throw error

      const result = data as unknown as LikeResult
      return result
    } catch (err) {
      logger.error('[usePostInteractions] toggleLike error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to toggle like',
      }
    }
  }, [])

  const fetchComments = useCallback(async (
    postId: string,
    limit = 20,
    offset = 0
  ): Promise<CommentsResult> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await withTimeout(
        async () => await (supabase.rpc as any)('get_post_comments', {
          p_post_id: postId,
          p_limit: limit,
          p_offset: offset,
        }),
        10_000
      )

      if (error) throw error

      const result = data as unknown as CommentsResult
      return {
        comments: Array.isArray(result.comments) ? result.comments : [],
        total: result.total ?? 0,
      }
    } catch (err) {
      logger.error('[usePostInteractions] fetchComments error:', err)
      return { comments: [], total: 0 }
    }
  }, [])

  const createComment = useCallback(async (
    postId: string,
    content: string
  ): Promise<CommentCreateResult> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await withTimeout(
        async () => await (supabase.rpc as any)('create_post_comment', {
          p_post_id: postId,
          p_content: content,
        }),
        15_000
      )

      if (error) throw error

      const result = data as unknown as CommentCreateResult
      return result
    } catch (err) {
      logger.error('[usePostInteractions] createComment error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create comment',
      }
    }
  }, [])

  const deleteComment = useCallback(async (commentId: string): Promise<SimpleResult> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await withTimeout(
        async () => await (supabase.rpc as any)('delete_post_comment', {
          p_comment_id: commentId,
        }),
        15_000
      )

      if (error) throw error

      const result = data as unknown as SimpleResult
      return result
    } catch (err) {
      logger.error('[usePostInteractions] deleteComment error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete comment',
      }
    }
  }, [])

  return { toggleLike, fetchComments, createComment, deleteComment }
}
