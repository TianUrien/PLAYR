import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { withTimeout } from '@/lib/retry'

export interface PostImage {
  url: string
  order: number
}

interface PostResult {
  success: boolean
  post_id?: string
  error?: string
}

interface SimpleResult {
  success: boolean
  error?: string
}

export function useUserPosts() {
  const createPost = useCallback(async (
    content: string,
    images?: PostImage[] | null
  ): Promise<PostResult> => {
    try {
      const { data, error } = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => await (supabase.rpc as any)('create_user_post', {
          p_content: content,
          p_images: images && images.length > 0 ? images : null,
        }),
        15_000
      )

      if (error) throw error

      const result = data as unknown as PostResult
      return result
    } catch (err) {
      logger.error('[useUserPosts] createPost error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create post',
      }
    }
  }, [])

  const updatePost = useCallback(async (
    postId: string,
    content: string,
    images?: PostImage[] | null
  ): Promise<SimpleResult> => {
    try {
      const { data, error } = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => await (supabase.rpc as any)('update_user_post', {
          p_post_id: postId,
          p_content: content,
          p_images: images && images.length > 0 ? images : null,
        }),
        15_000
      )

      if (error) throw error

      const result = data as unknown as SimpleResult
      return result
    } catch (err) {
      logger.error('[useUserPosts] updatePost error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update post',
      }
    }
  }, [])

  const deletePost = useCallback(async (postId: string): Promise<SimpleResult> => {
    try {
      const { data, error } = await withTimeout(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async () => await (supabase.rpc as any)('delete_user_post', {
          p_post_id: postId,
        }),
        15_000
      )

      if (error) throw error

      const result = data as unknown as SimpleResult
      return result
    } catch (err) {
      logger.error('[useUserPosts] deletePost error:', err)
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete post',
      }
    }
  }, [])

  return { createPost, updatePost, deletePost }
}
