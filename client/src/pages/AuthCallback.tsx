import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/lib/auth'

/**
 * AuthCallback - Handles email verification redirect from Supabase
 * 
 * STREAMLINED APPROACH:
 * 1. **Active Polling Only**: Check for session every 500ms
 * 2. **No Navigation Logic**: Let DashboardRouter handle all routing decisions
 * 3. **Proper Cleanup**: Track mounted state to prevent memory leaks
 * 4. **Trust Global Auth**: Let initializeAuth() listener manage profile fetching
 * 
 * This component's ONLY job:
 * - Wait for Supabase SDK to exchange PKCE code for session
 * - Verify session was established successfully
 * - Show loading state while waiting
 * - Handle errors if verification fails
 * 
 * Global auth system (initializeAuth) handles:
 * - Detecting session via onAuthStateChange
 * - Fetching user profile
 * - Updating auth store
 * 
 * DashboardRouter handles:
 * - All routing decisions based on profile state
 * - Redirecting to /complete-profile if needed
 * - Redirecting to dashboard when complete
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Verifying your email...')
  const isMountedRef = useRef(true)
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const navigationRef = useRef(false)
  const fallbackRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const storeUnsubscribeRef = useRef<(() => void) | null>(null)
  const hasAttemptedExchangeRef = useRef(false)
  const timelineRef = useRef({
    mountedAt: 0,
    sessionDetectedAt: 0,
    profileResolvedAt: 0,
    navigatedAt: 0,
    destination: '' as '' | '/complete-profile' | '/dashboard/profile'
  })

  useEffect(() => {
    isMountedRef.current = true
    const startTime = Date.now()
  timelineRef.current.mountedAt = startTime
  timelineRef.current.sessionDetectedAt = 0
  timelineRef.current.profileResolvedAt = 0
  timelineRef.current.navigatedAt = 0
  timelineRef.current.destination = ''

    // 🔍 Log initial state
  const queryParams = new URLSearchParams(window.location.search)
  const pkceCode = queryParams.get('code')
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.substring(1))
    const hasAccessToken = hashParams.has('access_token')
    const hasError = hashParams.has('error')
    
    logger.debug('[AUTH_CALLBACK] Initialized')
    logger.debug('[AUTH_CALLBACK] PKCE code present:', !!pkceCode)
    logger.debug('[AUTH_CALLBACK] Access token in hash:', hasAccessToken)
    logger.debug('[AUTH_CALLBACK] Error in hash:', hasError)

    if (typeof window !== 'undefined') {
      const storageKey = 'playr-auth'
      const codeVerifierKey = `${storageKey}-code-verifier`
      const localCodeVerifier = window.localStorage.getItem(codeVerifierKey)
      const sessionSnapshot = window.localStorage.getItem(storageKey)
      logger.debug('[AUTH_CALLBACK] Local code verifier present:', !!localCodeVerifier)
      if (localCodeVerifier) {
        logger.debug('[AUTH_CALLBACK] Local code verifier snippet:', localCodeVerifier.slice(0, 8))
      }
      logger.debug('[AUTH_CALLBACK] Stored auth payload present:', !!sessionSnapshot)
    }

    // Check for immediate errors in URL
    if (hasError) {
      const errorParam = hashParams.get('error')
      logger.error('[AUTH_CALLBACK] Error in URL:', errorParam)
      setError('Verification failed. Please try again.')
      return
    }

    // Track auth store changes so we can react immediately once profile status is known
    const evaluateRoutingDecision = (reason: string) => {
      if (!isMountedRef.current || navigationRef.current) return

      const state = useAuthStore.getState()
      if (!state.user) return

      if (!timelineRef.current.profileResolvedAt) {
        if (state.profileFetchedAt) {
          timelineRef.current.profileResolvedAt = state.profileFetchedAt
        } else if (state.profile || state.profileStatus === 'missing' || (!state.loading && state.user)) {
          timelineRef.current.profileResolvedAt = Date.now()
        }
      }

      if (state.profile && state.profile.full_name) {
        setStatus('Welcome back! Redirecting to your dashboard...')
        finalizeNavigation('/dashboard/profile', reason)
        return
      }

      if (state.profile && !state.profile.full_name) {
  setStatus("Let's finish setting up your profile...")
        finalizeNavigation('/complete-profile', reason)
        return
      }

      if (state.profileStatus === 'missing' || (!state.loading && state.user)) {
  setStatus("Let's finish setting up your profile...")
        finalizeNavigation('/complete-profile', reason)
      }
    }

    const attemptCodeExchange = async (code: string) => {
      if (!code || !isMountedRef.current || hasAttemptedExchangeRef.current) {
        return false
      }

      hasAttemptedExchangeRef.current = true
      logger.debug('[AUTH_CALLBACK] Attempting direct PKCE code exchange')
      if (isMountedRef.current) {
        setStatus('Verifying your code...')
      }

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!isMountedRef.current) {
          return false
        }

        if (error) {
          if (typeof window !== 'undefined') {
            const storageKey = 'playr-auth'
            const codeVerifierKey = `${storageKey}-code-verifier`
            logger.debug('[AUTH_CALLBACK] Exchange failed; code verifier present:', !!window.localStorage.getItem(codeVerifierKey))
          }
          logger.error('[AUTH_CALLBACK] Direct code exchange failed', error)
          return false
        }

        if (data.session) {
          logger.info('[AUTH_CALLBACK] Session established via direct exchange')
          handleSessionDetected('direct-exchange')
          return true
        }

        logger.warn('[AUTH_CALLBACK] Direct exchange returned no session')
        return false
      } catch (err) {
        logger.error('[AUTH_CALLBACK] Exception during code exchange', err)
        return false
      }
    }

    const startFallbackTimer = () => {
      if (fallbackRef.current) return
      fallbackRef.current = setTimeout(() => {
        logger.warn('[AUTH_CALLBACK] Fallback redirect triggered (profile still pending)')
        evaluateRoutingDecision('fallback-1500ms')
      }, 1500)
    }

    const finalizeNavigation = (destination: '/complete-profile' | '/dashboard/profile', reason: string) => {
      if (navigationRef.current || !isMountedRef.current) return
      navigationRef.current = true

      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current)
        fallbackRef.current = undefined
      }

      if (storeUnsubscribeRef.current) {
        storeUnsubscribeRef.current()
        storeUnsubscribeRef.current = null
      }

      const state = useAuthStore.getState()
      if (!timelineRef.current.profileResolvedAt) {
        timelineRef.current.profileResolvedAt = state.profileFetchedAt ?? Date.now()
      }
      timelineRef.current.navigatedAt = Date.now()
      timelineRef.current.destination = destination

      const summary = {
        reason,
        destination,
        totalMs: timelineRef.current.navigatedAt - timelineRef.current.mountedAt,
        timeToSessionMs: timelineRef.current.sessionDetectedAt
          ? timelineRef.current.sessionDetectedAt - timelineRef.current.mountedAt
          : null,
        timeToProfileMs:
          timelineRef.current.profileResolvedAt && timelineRef.current.sessionDetectedAt
            ? timelineRef.current.profileResolvedAt - timelineRef.current.sessionDetectedAt
            : null,
        timeFromSessionToNavMs: timelineRef.current.sessionDetectedAt
          ? timelineRef.current.navigatedAt - timelineRef.current.sessionDetectedAt
          : null,
        profileStatus: state.profileStatus,
        profileFetchedAt: state.profileFetchedAt
      }

      logger.info('[AUTH_CALLBACK] Navigation complete', summary)
      navigate(destination, { replace: true })
    }

    if (!storeUnsubscribeRef.current) {
      storeUnsubscribeRef.current = useAuthStore.subscribe(() => {
        evaluateRoutingDecision('store-update')
      })
    }

    const handleSessionDetected = (source: string) => {
      if (!isMountedRef.current) return

      if (!timelineRef.current.sessionDetectedAt) {
        timelineRef.current.sessionDetectedAt = Date.now()
      }

      const elapsed = timelineRef.current.sessionDetectedAt - timelineRef.current.mountedAt
      logger.info('[AUTH_CALLBACK] Session detected', { source, elapsed })

      setStatus('Session verified! Finalizing your account...')
      evaluateRoutingDecision(`session-${source}`)
      startFallbackTimer()
    }
    
    const checkForSession = async () => {
      try {
        // Check immediately first
        const { data: { session: immediateSession } } = await supabase.auth.getSession()
        
        if (!isMountedRef.current) return
        
        if (immediateSession) {
          const duration = Date.now() - startTime
          logger.info('[AUTH_CALLBACK] Session found immediately', { duration })
          handleSessionDetected('immediate')
          return
        }

        // Poll every 500ms for up to 10 seconds
        for (let attempt = 1; attempt <= 20; attempt++) {
          if (!isMountedRef.current) {
            logger.debug('[AUTH_CALLBACK] Component unmounted, stopping poll')
            return
          }

          // Cancellable timeout
          await new Promise<void>((resolve) => {
            timeoutRef.current = setTimeout(resolve, 500) as unknown as NodeJS.Timeout
          })

          if (!isMountedRef.current) return

          const { data: { session } } = await supabase.auth.getSession()
          
          if (!isMountedRef.current) return

          if (session) {
            const duration = Date.now() - startTime
            logger.info('[AUTH_CALLBACK] Session found via polling', { attempt, duration })
            handleSessionDetected(`poll-${attempt}`)
            return
          }

          // Update status every 2 seconds
          if (attempt % 4 === 0 && isMountedRef.current) {
            setStatus(`Still verifying... (${attempt * 500}ms)`)
            logger.debug(`[AUTH_CALLBACK] Still checking... (${attempt * 500}ms elapsed)`)
          }
        }

        // Timeout after 10 seconds
        if (!isMountedRef.current) return
        
        logger.error('[AUTH_CALLBACK] Timeout - no session found after 10 seconds')
        
        // Check for fallback implicit flow tokens
        const params = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')
        
        if (accessToken && refreshToken) {
          logger.debug('[AUTH_CALLBACK] Implicit flow tokens found, setting session...')
          if (isMountedRef.current) {
            setStatus('Establishing session...')
          }

          const { data: { session }, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })

          if (!isMountedRef.current) return

          if (sessionError) {
            logger.error('[AUTH_CALLBACK] Error setting session:', sessionError)
            setError('Failed to establish session. Please try again.')
            return
          }

          if (session) {
            logger.debug('[AUTH_CALLBACK] Session created from implicit flow')
            handleSessionDetected('implicit-flow')
            return
          }
        }

        // No session found
        logger.error('[AUTH_CALLBACK] Verification failed - link may be expired')
        if (isMountedRef.current) {
          setError('Verification link expired or already used. Please request a new one.')
        }

      } catch (err) {
        if (isMountedRef.current) {
          logger.error('[AUTH_CALLBACK] Error during session check:', err)
          setError('Verification failed. Please try again.')
        }
      }
    }

    const beginSessionResolution = async () => {
      if (pkceCode) {
        const exchanged = await attemptCodeExchange(pkceCode)
        if (exchanged) {
          return
        }
      }

      checkForSession()
    }

    // Start the resolution flow immediately
    beginSessionResolution()

    // Cleanup function
    return () => {
      isMountedRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current)
        fallbackRef.current = undefined
      }
      if (storeUnsubscribeRef.current) {
        storeUnsubscribeRef.current()
        storeUnsubscribeRef.current = null
      }
    }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verification Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#6366f1] mb-4"></div>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  )
}
