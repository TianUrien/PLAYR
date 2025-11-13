import { create } from 'zustand'
import type { User, PostgrestError, Session, AuthError } from '@supabase/supabase-js'
import { AuthApiError } from '@supabase/supabase-js'
import type { Profile, ProfileInsert } from './supabase'
import { supabase } from './supabase'
import { requestCache, generateCacheKey } from './requestCache'
import { monitor } from './monitor'
import { logger } from './logger'
import { useUnreadStore } from './unread'

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  hasCompletedOnboardingRedirect: boolean
  profileStatus: 'idle' | 'fetching' | 'missing' | 'loaded' | 'error'
  profileFetchedAt: number | null
  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
  setHasCompletedOnboardingRedirect: (value: boolean) => void
  signOut: () => Promise<void>
  fetchProfile: (userId: string, options?: { force?: boolean }) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  hasCompletedOnboardingRedirect: false,
  profileStatus: 'idle',
  profileFetchedAt: null,
  
  setUser: (user) => set({ user }),
  setProfile: (profile) => set((state) => ({
    profile,
    profileStatus: profile ? 'loaded' : state.profileStatus,
    profileFetchedAt: profile ? Date.now() : state.profileFetchedAt
  })),
  setLoading: (loading) => set({ loading }),
  setHasCompletedOnboardingRedirect: (value) => set({ hasCompletedOnboardingRedirect: value }),
  
  signOut: async () => {
    const { error } = await supabase.auth.signOut({ scope: 'global' })

    if (error) {
      logger.error('[AUTH_STORE] Failed to sign out via Supabase', { error })
      await clearLocalSession('manual-sign-out-fallback', { skipSupabaseSignOut: true })
      throw error
    }

    await clearLocalSession('manual-sign-out', { skipSupabaseSignOut: true })
  },
  
  fetchProfile: async (userId, options) => {
    const cacheKey = generateCacheKey('profile', { id: userId })
    const forceRefresh = options?.force ?? false
    const startedAt = Date.now()
    set({ profileStatus: 'fetching' })

    try {
      if (forceRefresh) {
        requestCache.invalidate(cacheKey)
      }
      const fetchOnce = async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (error) {
          const pgError = error as PostgrestError
          if (pgError.code === 'PGRST116' || pgError.details?.includes('0 rows')) {
            return null
          }
          throw error
        }
        return data
      }

      let data = await monitor.measure('fetch_profile', async () => {
        return await requestCache.dedupe(cacheKey, fetchOnce)
      }, { userId })

      const duration = Date.now() - startedAt
      if (!data) {
        const currentUser = get().user
        const roleMetadata = (currentUser?.user_metadata?.role as string | undefined) ?? null
        const email = currentUser?.email ?? null

        if (currentUser && roleMetadata && email) {
          logger.info('[AUTH_STORE] Creating placeholder profile', { userId, role: roleMetadata })
          const insertPayload: ProfileInsert = {
            id: currentUser.id,
            email,
            role: roleMetadata,
            full_name: '',
            base_location: '',
            nationality: ''
          }

          const { data: inserted, error: insertError } = await supabase
            .from('profiles')
            .insert(insertPayload)
            .select('*')
            .single()

          if (insertError) {
            const pgInsertError = insertError as PostgrestError
            if (pgInsertError.code === '23505') {
              logger.warn('[AUTH_STORE] Profile already existed during placeholder insert, retrying fetch', { userId })
              requestCache.invalidate(cacheKey)
              data = await requestCache.dedupe(cacheKey, fetchOnce)
            } else {
              logger.error('[AUTH_STORE] Error creating placeholder profile', { userId, insertError })
            }
          } else {
            data = inserted
          }
        } else {
          logger.error('[AUTH_STORE] Cannot create placeholder profile - missing metadata', { userId, hasUser: !!currentUser, roleMetadata, emailPresent: !!email })
        }
      }

      const resolvedAt = Date.now()
      if (data) {
        logger.debug('[AUTH_STORE] Profile fetched', { userId, duration })
        set({ profile: data, profileStatus: 'loaded', profileFetchedAt: resolvedAt })
      } else {
        logger.warn('[AUTH_STORE] Profile missing after fetch', { userId, duration })
        set({ profile: null, profileStatus: 'missing', profileFetchedAt: resolvedAt })
      }
    } catch (error) {
      logger.error('[AUTH_STORE] Error fetching profile', { userId, error })
      set({ profileStatus: 'error', profileFetchedAt: Date.now() })
    }
  }
}))

const localStorageAvailable = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

interface ClearSessionOptions {
  skipSupabaseSignOut?: boolean
}

const clearLocalSession = async (reason: string, options?: ClearSessionOptions) => {
  logger.warn('[AUTH_STORE] Clearing local session', { reason })

  if (!options?.skipSupabaseSignOut) {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (signOutError) {
      logger.error('[AUTH_STORE] Failed to clear local session', { reason, signOutError })
    }
  }

  requestCache.clear()

  try {
    useUnreadStore.getState().reset()
  } catch (unreadResetError) {
    logger.error('[AUTH_STORE] Failed to reset unread store during sign-out', { unreadResetError })
  }

  if (localStorageAvailable()) {
    try {
      window.localStorage.removeItem('playr-auth')
    } catch (storageError) {
      logger.error('[AUTH_STORE] Failed to remove cached session from storage', { storageError })
    }
  }

  useAuthStore.setState({
    user: null,
    profile: null,
    loading: false,
    hasCompletedOnboardingRedirect: false,
    profileStatus: 'idle',
    profileFetchedAt: null
  })
}

const isInvalidRefreshTokenError = (error: AuthError | null): error is AuthApiError => {
  if (!error) return false
  if (!(error instanceof AuthApiError)) return false
  return error.message.toLowerCase().includes('invalid refresh token')
}

const handleSessionError = async (error: AuthError | null, context: string): Promise<boolean> => {
  if (!error) return false

  if (isInvalidRefreshTokenError(error)) {
    await clearLocalSession(context)
    return true
  }

  logger.error('[AUTH_STORE] Session error encountered', { context, error })
  return false
}

const clearPendingRole = () => {
  if (!localStorageAvailable()) return
  window.localStorage.removeItem('pending_role')
  window.localStorage.removeItem('pending_email')
}

const resolvePendingRole = (user: User | null): string | null => {
  if (!localStorageAvailable() || !user?.email) return null
  const pendingRole = window.localStorage.getItem('pending_role')
  const pendingEmail = window.localStorage.getItem('pending_email')
  if (pendingRole && pendingEmail && pendingEmail === user.email) {
    return pendingRole
  }
  return null
}

const ensureUserRoleMetadata = async (user: User | null): Promise<string | null> => {
  if (!user) return null

  const currentRole = typeof user.user_metadata?.role === 'string' && user.user_metadata.role
    ? (user.user_metadata.role as string)
    : null

  if (currentRole) {
    clearPendingRole()
    return currentRole
  }

  const pendingRole = resolvePendingRole(user)
  if (pendingRole) {
    logger.warn('[AUTH_STORE] Hydrating missing role metadata from localStorage fallback', { userId: user.id, pendingRole })
    const { data, error } = await supabase.auth.updateUser({ data: { role: pendingRole } })
    if (error) {
      logger.error('[AUTH_STORE] Failed to backfill role metadata from localStorage', { userId: user.id, error })
    } else if (data.user) {
      useAuthStore.getState().setUser(data.user)
      clearPendingRole()
      return pendingRole
    }
  }

  const profileRole = useAuthStore.getState().profile?.role
  if (profileRole) {
    logger.warn('[AUTH_STORE] Backfilling missing role metadata from profile record', { userId: user.id, profileRole })
    const { data, error } = await supabase.auth.updateUser({ data: { role: profileRole } })
    if (error) {
      logger.error('[AUTH_STORE] Failed to sync role metadata from profile', { userId: user.id, error })
    } else if (data.user) {
      useAuthStore.getState().setUser(data.user)
      clearPendingRole()
      return profileRole
    }
  }

  logger.error('[AUTH_STORE] Unable to determine role metadata for user', { userId: user.id })
  return null
}

const runSessionEffects = async (session: Session | null) => {
  const { setUser, fetchProfile } = useAuthStore.getState()
  const user = session?.user ?? null
  setUser(user)

  if (user) {
    await ensureUserRoleMetadata(user)
    await fetchProfile(user.id)
  } else {
    useAuthStore.setState({ profile: null, profileStatus: 'idle', profileFetchedAt: null })
  }
}

// Initialize auth listener
export const initializeAuth = () => {
  const { setLoading } = useAuthStore.getState()

  // Check current session
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    const handled = await handleSessionError(error, 'getSession')
    if (handled) {
      setLoading(false)
      return
    }

    await runSessionEffects(session)
    setLoading(false)
  })

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setLoading(true)

    if (!session && event === 'SIGNED_OUT') {
      clearLocalSession('onAuthStateChange-signed-out', { skipSupabaseSignOut: true })
        .finally(() => setLoading(false))
      return
    }

    runSessionEffects(session)
      .catch((error) => logger.error('[AUTH_STORE] Error handling auth state change', { error, event }))
      .finally(() => setLoading(false))
  })

  return subscription
}

/**
 * Resend email verification
 * Used when user didn't receive the initial verification email
 */
export const resendVerificationEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      }
    })

    if (error) {
      console.error('Error resending verification email:', error)
      
      // Handle specific error cases
      if (error.message.includes('rate limit')) {
        return { success: false, error: 'Too many requests. Please wait a few minutes before trying again.' }
      }
      
      if (error.message.includes('already confirmed')) {
        return { success: false, error: 'This email is already verified. Try signing in.' }
      }
      
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('Unexpected error resending verification:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}
