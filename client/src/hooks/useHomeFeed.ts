import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { HomeFeedItem } from '@/types/homeFeed'

interface UseHomeFeedResult {
  items: HomeFeedItem[]
  isLoading: boolean
  error: string | null
  total: number
  hasMore: boolean
  refetch: () => Promise<void>
  loadMore: () => Promise<void>
  updateItemLike: (postId: string, liked: boolean, likeCount: number) => void
  removeItem: (feedItemId: string) => void
  prependItem: (item: HomeFeedItem) => void
}

const DEFAULT_LIMIT = 20

export function useHomeFeed(): UseHomeFeedResult {
  const [items, setItems] = useState<HomeFeedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)

  const fetchFeed = useCallback(async (reset = false) => {
    try {
      setIsLoading(true)
      setError(null)

      const currentOffset = reset ? 0 : offset

      const { data, error: rpcError } = await supabase.rpc('get_home_feed', {
        p_limit: DEFAULT_LIMIT,
        p_offset: currentOffset,
      })

      if (rpcError) throw rpcError

      const result = data as unknown as { items: HomeFeedItem[]; total: number }
      const feedItems = Array.isArray(result.items) ? result.items : []

      if (reset) {
        setItems(feedItems)
        setOffset(DEFAULT_LIMIT)
      } else {
        setItems(prev => [...prev, ...feedItems])
        setOffset(prev => prev + DEFAULT_LIMIT)
      }

      setTotal(result.total)
    } catch (err) {
      console.error('[useHomeFeed] Error fetching feed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setIsLoading(false)
    }
  }, [offset])

  const refetch = useCallback(async () => {
    await fetchFeed(true)
  }, [fetchFeed])

  const loadMore = useCallback(async () => {
    if (!isLoading && items.length < total) {
      await fetchFeed(false)
    }
  }, [fetchFeed, isLoading, items.length, total])

  // Optimistically update a post's like state in the items array
  const updateItemLike = useCallback((postId: string, liked: boolean, likeCount: number) => {
    setItems(prev => prev.map(item => {
      if (item.item_type === 'user_post' && item.post_id === postId) {
        return { ...item, has_liked: liked, like_count: likeCount }
      }
      return item
    }))
  }, [])

  // Remove an item from the feed (e.g., after deletion)
  const removeItem = useCallback((feedItemId: string) => {
    setItems(prev => prev.filter(item => item.feed_item_id !== feedItemId))
    setTotal(prev => Math.max(0, prev - 1))
  }, [])

  // Prepend a new item to the top of the feed (e.g., after creating a post)
  const prependItem = useCallback((item: HomeFeedItem) => {
    setItems(prev => [item, ...prev])
    setTotal(prev => prev + 1)
  }, [])

  useEffect(() => {
    fetchFeed(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    items,
    isLoading,
    error,
    total,
    hasMore: items.length < total,
    refetch,
    loadMore,
    updateItemLike,
    removeItem,
    prependItem,
  }
}
