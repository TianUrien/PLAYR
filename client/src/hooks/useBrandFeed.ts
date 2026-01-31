/**
 * useBrandFeed Hook
 *
 * Fetches the unified global brand feed (products + posts) with pagination.
 * Used on the Brands page Global Feed tab.
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { ProductImage } from './useBrandProducts'

export interface FeedItemBase {
  id: string
  brand_id: string
  brand_name: string
  brand_slug: string
  brand_logo_url: string | null
  brand_category: string | null
  brand_is_verified: boolean
  created_at: string
}

export interface ProductFeedItem extends FeedItemBase {
  type: 'product'
  product_name: string
  product_description: string | null
  product_images: ProductImage[]
  product_external_url: string | null
}

export interface PostFeedItem extends FeedItemBase {
  type: 'post'
  post_content: string
  post_image_url: string | null
}

export type FeedItem = ProductFeedItem | PostFeedItem

interface UseBrandFeedResult {
  items: FeedItem[]
  isLoading: boolean
  error: string | null
  total: number
  hasMore: boolean
  refetch: () => Promise<void>
  loadMore: () => Promise<void>
}

const DEFAULT_LIMIT = 20

export function useBrandFeed(): UseBrandFeedResult {
  const [items, setItems] = useState<FeedItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)

  const fetchFeed = useCallback(async (reset = false) => {
    try {
      setIsLoading(true)
      setError(null)

      const currentOffset = reset ? 0 : offset

      const { data, error: rpcError } = await supabase.rpc('get_brand_feed', {
        p_limit: DEFAULT_LIMIT,
        p_offset: currentOffset,
      })

      if (rpcError) throw rpcError

      const result = data as unknown as { items: FeedItem[]; total: number }

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
      logger.error('[useBrandFeed] Error fetching feed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setIsLoading(false)
    }
  }, [offset])

  const refetch = useCallback(async () => {
    setOffset(0)
    await fetchFeed(true)
  }, [fetchFeed])

  const loadMore = useCallback(async () => {
    if (!isLoading && items.length < total) {
      await fetchFeed(false)
    }
  }, [fetchFeed, isLoading, items.length, total])

  useEffect(() => {
    fetchFeed(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    items,
    isLoading,
    error,
    total,
    hasMore: items.length < total,
    refetch,
    loadMore,
  }
}
