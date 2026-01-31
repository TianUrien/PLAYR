/**
 * useBrand Hook
 *
 * React hook for fetching a single brand by slug.
 * Used on the Brand profile page.
 */

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { Brand, BrandCategory } from './useBrands'

export interface BrandDetail extends Brand {
  profile_id: string
  updated_at: string
}

interface UseBrandResult {
  brand: BrandDetail | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useBrand(slug: string | undefined): UseBrandResult {
  const [brand, setBrand] = useState<BrandDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBrand = useCallback(async () => {
    if (!slug) {
      setBrand(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_brand_by_slug', {
        p_slug: slug,
      })

      if (rpcError) {
        throw rpcError
      }

      setBrand(data as BrandDetail | null)
    } catch (err) {
      logger.error('[useBrand] Error fetching brand:', err)
      setError(err instanceof Error ? err.message : 'Failed to load brand')
      setBrand(null)
    } finally {
      setIsLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchBrand()
  }, [fetchBrand])

  return {
    brand,
    isLoading,
    error,
    refetch: fetchBrand,
  }
}
