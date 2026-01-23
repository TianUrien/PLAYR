/**
 * useEngagementTracking Hook
 *
 * Tracks user engagement via heartbeat pings while the tab is visible and active.
 * Sends a heartbeat every 30 seconds to measure actual time-in-app.
 *
 * Features:
 * - Pauses when tab is hidden (Page Visibility API)
 * - Pauses when user is idle (no mouse/keyboard activity for 2 minutes)
 * - Generates unique session ID per browser session
 * - Graceful error handling (silent failures don't break the app)
 *
 * Usage:
 *   // In App.tsx or a top-level component
 *   useEngagementTracking()
 */

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { logger } from '@/lib/logger'

// Configuration
const HEARTBEAT_INTERVAL_MS = 30_000 // 30 seconds - must match server
const IDLE_TIMEOUT_MS = 120_000 // 2 minutes of inactivity = idle
const SESSION_STORAGE_KEY = 'playr_engagement_session_id'

// Helper to call RPC functions that aren't in generated types yet
const engagementRpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * Generate or retrieve a session ID for the current browser session.
 * Stored in sessionStorage so it persists across page navigations
 * but resets when the tab/browser is closed.
 */
function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!sessionId) {
    sessionId = crypto.randomUUID()
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId)
  }
  return sessionId
}

/**
 * Hook to track user engagement via periodic heartbeats.
 * Call this once at the app root level.
 */
export function useEngagementTracking(): void {
  const { user, profile } = useAuthStore()
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const isIdleRef = useRef<boolean>(false)
  const isVisibleRef = useRef<boolean>(!document.hidden)
  const sessionIdRef = useRef<string | null>(null)

  // Send heartbeat to server
  const sendHeartbeat = useCallback(async () => {
    // Skip if no user, no profile (FK constraint), or no session
    if (!user?.id || !profile?.id || !sessionIdRef.current) return

    // Skip if tab is hidden or user is idle
    if (!isVisibleRef.current || isIdleRef.current) {
      logger.debug('[Engagement] Skipping heartbeat - tab hidden or user idle')
      return
    }

    try {
      const { error } = await engagementRpc('record_engagement_heartbeat', {
        p_session_id: sessionIdRef.current,
      })

      if (error) {
        // Log but don't throw - engagement tracking shouldn't break the app
        logger.warn('[Engagement] Heartbeat failed:', error.message)
      } else {
        logger.debug('[Engagement] Heartbeat sent')
      }
    } catch (err) {
      logger.warn('[Engagement] Heartbeat error:', err)
    }
  }, [user?.id, profile?.id])

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    isVisibleRef.current = !document.hidden

    if (document.hidden) {
      logger.debug('[Engagement] Tab hidden - pausing heartbeats')
    } else {
      logger.debug('[Engagement] Tab visible - resuming heartbeats')
      // Reset activity timer when tab becomes visible
      lastActivityRef.current = Date.now()
      isIdleRef.current = false
      // Send immediate heartbeat on tab focus
      sendHeartbeat()
    }
  }, [sendHeartbeat])

  // Handle user activity (reset idle timer)
  const handleUserActivity = useCallback(() => {
    const wasIdle = isIdleRef.current
    lastActivityRef.current = Date.now()
    isIdleRef.current = false

    // If user was idle, send a heartbeat immediately
    if (wasIdle && isVisibleRef.current) {
      logger.debug('[Engagement] User active again - sending heartbeat')
      sendHeartbeat()
    }
  }, [sendHeartbeat])

  // Check for idle state
  const checkIdleState = useCallback(() => {
    const now = Date.now()
    const timeSinceActivity = now - lastActivityRef.current

    if (timeSinceActivity >= IDLE_TIMEOUT_MS && !isIdleRef.current) {
      isIdleRef.current = true
      logger.debug('[Engagement] User idle - pausing heartbeats')
    }
  }, [])

  // Main effect - setup and cleanup
  useEffect(() => {
    // Only track for authenticated users with a profile
    // Profile is required because user_engagement_heartbeats has FK to profiles
    if (!user?.id || !profile?.id) {
      return
    }

    // Get or create session ID
    sessionIdRef.current = getOrCreateSessionId()
    logger.info('[Engagement] Tracking started', { sessionId: sessionIdRef.current })

    // Send initial heartbeat
    sendHeartbeat()

    // Setup heartbeat interval
    heartbeatIntervalRef.current = setInterval(() => {
      checkIdleState()
      sendHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)

    // Setup visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Setup activity listeners for idle detection
    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
    activityEvents.forEach((event) => {
      document.addEventListener(event, handleUserActivity, { passive: true })
    })

    // Cleanup
    return () => {
      logger.debug('[Engagement] Tracking stopped')

      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }

      document.removeEventListener('visibilitychange', handleVisibilityChange)
      activityEvents.forEach((event) => {
        document.removeEventListener(event, handleUserActivity)
      })
    }
  }, [user?.id, profile?.id, sendHeartbeat, handleVisibilityChange, handleUserActivity, checkIdleState])
}

export default useEngagementTracking
