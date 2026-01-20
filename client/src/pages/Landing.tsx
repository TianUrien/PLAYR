import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import { Input, Button, InAppBrowserWarning, PublicNav } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getAuthRedirectUrl } from '@/lib/siteUrl'
import { supportsReliableOAuth } from '@/lib/inAppBrowser'

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuthStore()
  
  // Check if user was redirected from a protected route (e.g., /settings from email link)
  const redirectTo = (location.state as { from?: string } | null)?.from
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const captureAuthFlowError = (
    err: unknown,
    payload: Record<string, unknown>,
    sourceComponent: string,
    explicitUserId?: string | null
  ) => {
    Sentry.captureException(err, {
      tags: { feature: 'auth_flow' },
      extra: {
        userId: explicitUserId ?? user?.id ?? null,
        payload,
        sourceComponent,
      },
    })
  }

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      const destination = redirectTo || '/dashboard/profile'
      navigate(destination)
    }
  }, [user, profile, navigate, redirectTo])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        captureAuthFlowError(signInError, {
          stage: 'signInWithPassword',
          emailDomain: email.split('@')[1] ?? null,
        }, 'Landing.handleSignIn.supabaseSignIn', null)
        // Check if error is due to unverified email
        if (signInError.message.includes('Email not confirmed')) {
          // Redirect to verification page
          logger.debug('[SIGN IN] Email not verified, redirecting to verification page')
          navigate(`/verify-email?email=${encodeURIComponent(email)}&reason=unverified_signin`)
          return
        }
        throw signInError
      }

      if (!data.user) {
        throw new Error('No user data returned')
      }

      logger.debug('[SIGN IN] Sign in successful, checking profile...')

      // Check if profile exists and is complete
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', data.user.id)
        .single()

      // Handle profile not found - redirect to complete profile
      if (profileError && profileError.code === 'PGRST116') {
        logger.debug('[SIGN IN] Profile not found, redirecting to complete profile')
        navigate('/complete-profile')
        return
      }

      // Other profile errors - don't sign out, let user retry
      if (profileError) {
        captureAuthFlowError(profileError, {
          stage: 'profileFetch',
          emailDomain: email.split('@')[1] ?? null,
        }, 'Landing.handleSignIn.profileFetch', data.user.id)
        logger.error('[SIGN IN] Error fetching profile:', profileError)
        setError('Could not load your profile. Please try again or contact support if this persists.')
        setLoading(false)
        return
      }

      if (!profileData) {
        logger.error('[SIGN IN] Profile is null (unexpected)')
        setError('Profile not found. Please contact support.')
        setLoading(false)
        return
      }

      // Check if profile is incomplete (zombie account recovery!)
      if (!profileData.full_name) {
        logger.debug('[SIGN IN] Profile incomplete (no full_name), redirecting to complete profile')
        navigate('/complete-profile')
        return
      }

      // Profile is complete - redirect to intended destination or dashboard
      const destination = redirectTo || '/dashboard/profile'
      logger.debug('[SIGN IN] Profile complete, redirecting to:', destination)
      navigate(destination)

    } catch (err) {
      captureAuthFlowError(err, {
        stage: 'Landing.handleSignIn.catch',
        emailDomain: email.split('@')[1] ?? null,
      }, 'Landing.handleSignIn.catch', null)
      logger.error('[SIGN IN] Sign in error:', err)
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] relative overflow-hidden flex flex-col bg-black">
      {/* In-App Browser Warning */}
      <InAppBrowserWarning context="login" />
      
      {/* Background Image with Overlay - Responsive Art Direction */}
      <div className="absolute inset-0" aria-hidden="true">
        {/* Mobile: Portrait-optimized image */}
        <div className="lg:hidden h-full w-full bg-[url('/hero-mobile.webp')] bg-cover bg-center" />
        {/* Desktop: Landscape-optimized image */}
        <div className="hidden lg:block h-full w-full bg-[url('/hero-desktop.webp')] bg-cover bg-center" />
        {/* Multi-stop gradient: dark top for logo, clear middle for hero visibility, dark bottom for form */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 via-50% to-black/75" />
      </div>

      {/* ===== MOBILE LAYOUT (< lg) ===== */}
      <div className="lg:hidden relative z-10 flex flex-col min-h-[100dvh] pt-[env(safe-area-inset-top)]">
        <PublicNav transparent />

        {/* Hero Zone */}
        <div className="flex-none flex flex-col justify-start px-6 pt-4 pb-4">
          <h1 className="text-center text-[1.85rem] xs:text-[2.05rem] font-bold text-white leading-tight tracking-tight">
            Built for<br />Field Hockey.
          </h1>
          <p className="text-center text-white/80 text-sm mt-2">
            Connect players, coaches, and clubs.
          </p>
        </div>

        {/* Sign In Card */}
        <div className="flex-shrink-0 px-6 pb-[env(safe-area-inset-bottom)] mt-3">
          <div 
            data-signin-card
            className="rounded-2xl px-5 py-5 bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl"
          >
            <h2 className="text-sm font-semibold text-white text-center mb-3">Sign In</h2>
            
            <form onSubmit={handleSignIn} className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium text-gray-400 mb-1">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="!bg-white border-0 text-gray-900 placeholder:text-gray-400 !h-10 !text-[13px] !rounded-xl"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] font-medium text-gray-400">Password</label>
                  <button
                    type="button"
                    onClick={() => navigate('/forgot-password')}
                    className="text-[11px] text-gray-400 hover:text-white transition-colors"
                  >
                    Forgot?
                  </button>
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="!bg-white border-0 text-gray-900 placeholder:text-gray-400 !h-10 !text-[13px] !rounded-xl"
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs">{error}</p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full !h-10 !rounded-xl text-[13px] font-semibold"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="relative my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/15"></div>
              </div>
              <div className="relative flex justify-center">
                <span className="px-3 text-[10px] text-gray-500 bg-black/50">or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (!supportsReliableOAuth()) {
                  alert('Google Sign-In may not work in this browser. Please use email/password login, or open PLAYR in Safari or Chrome.')
                  return
                }
                supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getAuthRedirectUrl() } })
              }}
              className="w-full flex items-center justify-center gap-2 h-10 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span className="text-gray-700 text-[13px] font-medium">Continue with Google</span>
            </button>

            <p className="mt-3 text-center text-[11px] text-gray-400">
              New here?{' '}
              <button
                onClick={() => navigate('/signup')}
                className="text-[#8b5cf6] hover:text-[#a78bfa] font-semibold transition-colors"
              >
                Join PLAYR
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* ===== DESKTOP LAYOUT (≥ lg) ===== */}
      <div className="hidden lg:flex relative z-10 flex-1 flex-col">
        {/* Public Navigation */}
        <PublicNav transparent />

        {/* Desktop Content */}
        <div className="flex-1 flex items-center px-8 xl:px-16">
          {/* Hero Content */}
          <div className="flex-1 pr-12 xl:pr-24">
            <img 
              src="/WhiteLogo.svg" 
              alt="PLAYR" 
              className="h-24 xl:h-32 mb-6 object-contain"
              fetchPriority="high"
              loading="eager"
            />
            <h1 className="text-5xl xl:text-6xl font-bold text-white leading-tight">
              Built for Field Hockey.
            </h1>
            <p className="text-xl lg:text-2xl text-gray-200 mt-6 mb-4">
              Connect players, coaches, and clubs.
            </p>
            <p className="text-xl lg:text-2xl text-gray-200">
              Raise the sport together.
            </p>
          </div>

          {/* Sign In Card - Desktop */}
          <div className="w-[400px] xl:w-[420px]">
            <div 
              data-signin-card
              className="rounded-2xl p-8 bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl"
            >
              <h2 className="text-2xl font-bold text-white text-center mb-6">Sign In</h2>
              
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="!bg-white border-0 text-gray-900 placeholder:text-gray-400 !h-12 !rounded-xl"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-gray-400">Password</label>
                    <button
                      type="button"
                      onClick={() => navigate('/forgot-password')}
                      className="text-xs text-gray-400 hover:text-white transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="!bg-white border-0 text-gray-900 placeholder:text-gray-400 !h-12 !rounded-xl"
                    required
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full !h-12 !rounded-xl text-base font-semibold shadow-lg"
                  disabled={loading}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/15"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="px-3 text-xs text-gray-500 bg-black/60">or continue with</span>
                </div>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={() => {
                  if (!supportsReliableOAuth()) {
                    alert('Google Sign-In may not work in this browser. Please use email/password login, or open PLAYR in Safari or Chrome.')
                    return
                  }
                  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getAuthRedirectUrl() } })
                }}
                className="w-full flex items-center justify-center gap-2.5 h-12 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-gray-700 font-medium">Continue with Google</span>
              </button>

              {/* Join CTA */}
              <p className="mt-5 text-center text-sm text-gray-400">
                New here?{' '}
                <button
                  onClick={() => navigate('/signup')}
                  className="text-[#a78bfa] hover:text-[#c4b5fd] font-semibold transition-colors"
                >
                  Join PLAYR
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
