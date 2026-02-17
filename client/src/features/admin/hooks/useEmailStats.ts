import { useState, useEffect, useCallback } from 'react'
import {
  getEmailOverview,
  getEmailTemplates,
  getEmailCampaigns,
  getEmailEngagementExplorer,
  previewCampaignAudience,
} from '../api/adminApi'
import type {
  EmailOverviewStats,
  EmailTemplate,
  EmailCampaign,
  EmailEngagementItem,
  EmailEngagementSearchParams,
  AudiencePreview,
} from '../types'
import { logger } from '@/lib/logger'

export function useEmailOverview(days: number) {
  const [data, setData] = useState<EmailOverviewStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getEmailOverview(days)
      setData(result)
    } catch (err) {
      logger.error('[useEmailOverview] Failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load email overview')
    } finally {
      setIsLoading(false)
    }
  }, [days])

  useEffect(() => { fetch() }, [fetch])

  return { data, isLoading, error, refetch: fetch }
}

export function useEmailTemplates() {
  const [data, setData] = useState<EmailTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getEmailTemplates()
      setData(result)
    } catch (err) {
      logger.error('[useEmailTemplates] Failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load email templates')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { data, isLoading, error, refetch: fetch }
}

export function useEmailCampaigns(params: { status?: string; limit?: number; offset?: number } = {}) {
  const [data, setData] = useState<EmailCampaign[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getEmailCampaigns(params)
      setData(result.campaigns)
      setTotalCount(result.totalCount)
    } catch (err) {
      logger.error('[useEmailCampaigns] Failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load campaigns')
    } finally {
      setIsLoading(false)
    }
  }, [params.status, params.limit, params.offset])

  useEffect(() => { fetch() }, [fetch])

  return { data, totalCount, isLoading, error, refetch: fetch }
}

export function useEmailEngagement(params: EmailEngagementSearchParams = {}) {
  const [data, setData] = useState<EmailEngagementItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getEmailEngagementExplorer(params)
      setData(result.items)
      setTotalCount(result.totalCount)
    } catch (err) {
      logger.error('[useEmailEngagement] Failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to load engagement data')
    } finally {
      setIsLoading(false)
    }
  }, [params.template_key, params.status, params.role, params.limit, params.offset])

  useEffect(() => { fetch() }, [fetch])

  return { data, totalCount, isLoading, error, refetch: fetch }
}

export function useAudiencePreview() {
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPreview = useCallback(async (category: string, audienceFilter: { role?: string; country?: string }) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await previewCampaignAudience(category, audienceFilter)
      setPreview(result)
    } catch (err) {
      logger.error('[useAudiencePreview] Failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to preview audience')
      setPreview(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setPreview(null)
    setError(null)
  }, [])

  return { preview, isLoading, error, fetchPreview, reset }
}
