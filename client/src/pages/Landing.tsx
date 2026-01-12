import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { Input, Button } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getAuthRedirectUrl } from '@/lib/siteUrl'

export default function Landing() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile } = useAuthStore()
  
  // Check if user was redirected from a protected route (e.g., /settings from email link)
  const redirectTo = (location.state as { from?: string } | null)?.from
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="h-full w-full bg-[url('/hero-desktop.webp')] bg-cover bg-center" />
        {/* Overlay gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-black/30 lg:from-black/70 lg:via-black/60 lg:to-black/80" />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* Hero Content - Stacked on mobile, left column on desktop */}
        <div className="flex-1 flex flex-col justify-center px-6 py-12 sm:px-8 md:px-12 lg:px-16 xl:px-24">
          <div className="max-w-2xl mx-auto lg:mx-0 text-center lg:text-left">
            <img 
              src="/WhiteLogo.svg" 
              alt="PLAYR" 
              className="h-16 sm:h-20 lg:h-24 xl:h-32 mb-6 object-contain mx-auto lg:mx-0"
              fetchPriority="high"
              loading="eager"
            />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 lg:mb-8 leading-tight">
              Built for Field Hockey.
            </h1>
            <p className="text-lg sm:text-xl lg:text-2xl text-gray-200 mb-3 lg:mb-4">
              Connect players, coaches, and clubs.
            </p>
            <p className="text-lg sm:text-xl lg:text-2xl text-gray-200 mb-8 lg:mb-0">
              Raise the sport together.
            </p>

            {/* Primary CTA - Mobile only */}
            <div className="lg:hidden mt-8">
              <button
                onClick={() => navigate('/signup')}
                className="w-full sm:w-auto min-h-[44px] px-8 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity text-base sm:text-lg shadow-lg"
              >
                Join PLAYR
              </button>
            </div>
          </div>
        </div>

        {/* Sign In Card - Below content on mobile, right column on desktop */}
        <div className="w-full lg:w-[500px] flex items-center justify-center px-6 py-8 sm:px-8 lg:p-8">
          <div className="w-full max-w-md rounded-3xl p-6 sm:p-8 bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl">
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2 text-center lg:text-left">Sign In to PLAYR</h3>
            
            <form onSubmit={handleSignIn} className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="!bg-white/90 border-white/20"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-200 mb-2">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="!bg-white/90 border-white/20"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Forgot Password Link */}
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => navigate('/forgot-password')}
                  className="text-sm text-[#8b5cf6] hover:text-[#a78bfa] font-medium"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full min-h-[44px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 shadow-lg"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {/* Social Login Divider */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/20"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-black/40 text-gray-400">or continue with</span>
                </div>
              </div>

              {/* Social Buttons */}
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: getAuthRedirectUrl() } })}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white rounded-lg hover:bg-gray-100 transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-gray-700 font-medium">Continue with Google</span>
                </button>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/signup')}
                className="text-[#8b5cf6] hover:text-[#a78bfa] font-medium min-h-[44px] inline-flex items-center justify-center"
              >
                Don't have an account? Join Now →
              </button>
            </div>

            <p className="text-center text-gray-400 text-sm mt-4 italic">
              PLAYR is where hockey lives.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
