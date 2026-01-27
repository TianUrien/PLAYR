/**
 * Client-side rate limiting utilities
 * Uses Supabase RPC functions for database-backed rate limiting
 */

import { supabase } from './supabase'
import { logger } from './logger'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset_at: string
  limit: number
}

/**
 * Get client IP address for rate limiting
 * Falls back to a session-based identifier if IP cannot be determined
 */
const getClientIdentifier = (): string => {
  // For client-side, we can't reliably get IP
  // Use a combination of browser fingerprinting as fallback
  // In production, this should be enhanced with server-side IP detection
  const sessionId = sessionStorage.getItem('rate_limit_session')
  if (sessionId) return sessionId

  const newSessionId = crypto.randomUUID()
  sessionStorage.setItem('rate_limit_session', newSessionId)
  return newSessionId
}

/**
 * Check login rate limit
 * @returns RateLimitResult or null if check fails
 */
export const checkLoginRateLimit = async (): Promise<RateLimitResult | null> => {
  try {
    const identifier = getClientIdentifier()
    const { data, error } = await supabase.rpc('check_login_rate_limit', {
      p_ip: identifier
    })

    if (error) {
      logger.error('[RATE_LIMIT] Login rate limit check failed', { error })
      // On error, allow the request (fail open)
      return null
    }

    return data as RateLimitResult
  } catch (err) {
    logger.error('[RATE_LIMIT] Unexpected error checking login rate limit', { err })
    return null
  }
}

/**
 * Check signup rate limit
 * @returns RateLimitResult or null if check fails
 */
export const checkSignupRateLimit = async (): Promise<RateLimitResult | null> => {
  try {
    const identifier = getClientIdentifier()
    const { data, error } = await supabase.rpc('check_signup_rate_limit', {
      p_ip: identifier
    })

    if (error) {
      logger.error('[RATE_LIMIT] Signup rate limit check failed', { error })
      return null
    }

    return data as RateLimitResult
  } catch (err) {
    logger.error('[RATE_LIMIT] Unexpected error checking signup rate limit', { err })
    return null
  }
}

/**
 * Check password reset rate limit
 * @param email - User's email address
 * @returns RateLimitResult or null if check fails
 */
export const checkPasswordResetRateLimit = async (email: string): Promise<RateLimitResult | null> => {
  try {
    const { data, error } = await supabase.rpc('check_password_reset_rate_limit', {
      p_email: email
    })

    if (error) {
      logger.error('[RATE_LIMIT] Password reset rate limit check failed', { error })
      return null
    }

    return data as RateLimitResult
  } catch (err) {
    logger.error('[RATE_LIMIT] Unexpected error checking password reset rate limit', { err })
    return null
  }
}

/**
 * Check opportunity application rate limit
 * @param userId - User's ID
 * @returns RateLimitResult or null if check fails
 */
export const checkApplicationRateLimit = async (userId: string): Promise<RateLimitResult | null> => {
  try {
    const { data, error } = await supabase.rpc('check_application_rate_limit', {
      p_user_id: userId
    })

    if (error) {
      logger.error('[RATE_LIMIT] Application rate limit check failed', { error })
      return null
    }

    return data as RateLimitResult
  } catch (err) {
    logger.error('[RATE_LIMIT] Unexpected error checking application rate limit', { err })
    return null
  }
}

/**
 * Format rate limit error message for user display
 */
export const formatRateLimitError = (result: RateLimitResult): string => {
  const resetDate = new Date(result.reset_at)
  const now = new Date()
  const diffMs = resetDate.getTime() - now.getTime()
  const diffMinutes = Math.ceil(diffMs / 60000)

  if (diffMinutes <= 1) {
    return 'Too many attempts. Please try again in a minute.'
  } else if (diffMinutes < 60) {
    return `Too many attempts. Please try again in ${diffMinutes} minutes.`
  } else {
    const diffHours = Math.ceil(diffMinutes / 60)
    return `Too many attempts. Please try again in ${diffHours} hour${diffHours > 1 ? 's' : ''}.`
  }
}
