/**
 * Advanced Analytics API Module
 *
 * Functions for querying feed, notification, funnel, community, and marketplace analytics.
 * All functions require the caller to be an admin.
 */

import { supabase } from '@/lib/supabase'
import type {
  FeedAnalytics,
  NotificationEffectiveness,
  ConversionFunnels,
  CommunityAnalytics,
  MarketplaceHealth,
} from '../types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>

export async function getFeedAnalytics(days = 30): Promise<FeedAnalytics> {
  const { data, error } = await adminRpc('admin_get_feed_analytics', { p_days: days })
  if (error) throw new Error(`Failed to get feed analytics: ${error.message}`)
  return data as FeedAnalytics
}

export async function getNotificationEffectiveness(days = 30): Promise<NotificationEffectiveness> {
  const { data, error } = await adminRpc('admin_get_notification_effectiveness', { p_days: days })
  if (error) throw new Error(`Failed to get notification effectiveness: ${error.message}`)
  return data as NotificationEffectiveness
}

export async function getConversionFunnels(days = 30): Promise<ConversionFunnels> {
  const { data, error } = await adminRpc('admin_get_conversion_funnels', { p_days: days })
  if (error) throw new Error(`Failed to get conversion funnels: ${error.message}`)
  return data as ConversionFunnels
}

export async function getCommunityAnalytics(days = 30): Promise<CommunityAnalytics> {
  const { data, error } = await adminRpc('admin_get_community_analytics', { p_days: days })
  if (error) throw new Error(`Failed to get community analytics: ${error.message}`)
  return data as CommunityAnalytics
}

export async function getMarketplaceHealth(days = 30): Promise<MarketplaceHealth> {
  const { data, error } = await adminRpc('admin_get_marketplace_health', { p_days: days })
  if (error) throw new Error(`Failed to get marketplace health: ${error.message}`)
  return data as MarketplaceHealth
}
