import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { Input, Button } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export default function Landing() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (user && profile) {
      navigate('/dashboard/profile')
    }
  }, [user, profile, navigate])

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
        // Check if error is due to unverified email
        if (signInError.message.includes('Email not confirmed')) {
          // Redirect to verification page
          console.log('[SIGN IN] Email not verified, redirecting to verification page')
          navigate(`/verify-email?email=${encodeURIComponent(email)}&reason=unverified_signin`)
          return
        }
        throw signInError
      }

      if (!data.user) {
        throw new Error('No user data returned')
      }

      console.log('[SIGN IN] Sign in successful, checking profile...')

      // Check if profile exists and is complete
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', data.user.id)
        .single()

      // Handle profile not found - redirect to complete profile
      if (profileError && profileError.code === 'PGRST116') {
        console.log('[SIGN IN] Profile not found, redirecting to complete profile')
        navigate('/complete-profile')
        return
      }

      // Other profile errors - don't sign out, let user retry
      if (profileError) {
        console.error('[SIGN IN] Error fetching profile:', profileError)
        setError('Could not load your profile. Please try again or contact support if this persists.')
        setLoading(false)
        return
      }

      if (!profileData) {
        console.error('[SIGN IN] Profile is null (unexpected)')
        setError('Profile not found. Please contact support.')
        setLoading(false)
        return
      }

      // Check if profile is incomplete (zombie account recovery!)
      if (!profileData.full_name) {
        console.log('[SIGN IN] Profile incomplete (no full_name), redirecting to complete profile')
        navigate('/complete-profile')
        return
      }

      // Profile is complete - go to dashboard
      console.log('[SIGN IN] Profile complete, redirecting to dashboard')
      navigate('/dashboard/profile')

    } catch (err) {
      console.error('[SIGN IN] Sign in error:', err)
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0">
        <img 
          src="/hero-desktop.webp"
          alt="Field Hockey"
          className="w-full h-full object-cover"
          fetchPriority="high"
          loading="eager"
        />
        {/* Mobile gradient: lighter for readability */}
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
          <div className="w-full max-w-md rounded-3xl p-6 sm:p-8 bg-white shadow-xl lg:glass-strong lg:bg-transparent lg:shadow-none">
            <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 lg:text-white mb-2">Sign In to PLAYR</h3>
            
            <form onSubmit={handleSignIn} className="space-y-4 mt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 lg:text-white mb-2">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-white lg:bg-white/90"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 lg:text-white mb-2">Password</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white lg:bg-white/90"
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

              {error && (
                <p className="text-red-600 lg:text-red-400 text-sm">{error}</p>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full min-h-[44px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <button
                onClick={() => navigate('/signup')}
                className="text-[#6366f1] hover:text-[#4f46e5] lg:text-[#8b5cf6] lg:hover:text-[#6366f1] font-medium min-h-[44px] inline-flex items-center justify-center"
              >
                Don't have an account? Join Now →
              </button>
            </div>

            <p className="text-center text-gray-500 lg:text-gray-400 text-sm mt-6 italic">
              PLAYR is where hockey lives.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
