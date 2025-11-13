import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, Building2, Briefcase } from 'lucide-react'
import { Input, Button } from '@/components'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

type UserRole = 'player' | 'coach' | 'club'

/**
 * SignUp - Step 1 of signup (PRE email verification)
 * 
 * Flow:
 * 1. User selects role
 * 2. User enters email + password
 * 3. Create auth account with role in metadata
 * 4. Store role in localStorage (fallback)
 * 5. Redirect to /verify-email to check inbox
 * 
 * NO profile data collection yet - that happens AFTER verification
 */
export default function SignUp() {
  const navigate = useNavigate()
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!selectedRole) {
        throw new Error('Please select a role')
      }

      if (formData.password.length < 8) {
        throw new Error('Password must be at least 8 characters long')
      }

      logger.debug('Creating auth account with role:', selectedRole)

      // Create auth account (no session until email verified)
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            role: selectedRole, // Store in user_metadata
          }
        }
      })

      if (signUpError) {
        // Handle "user already exists" error with helpful message
        if (signUpError.message.includes('already registered') || 
            signUpError.message.includes('already exists') ||
            signUpError.message.includes('User already registered')) {
          logger.debug('User already registered, showing helpful error')
          setError('This email is already registered. Please sign in instead.')
          setTimeout(() => {
            navigate(`/?email=${encodeURIComponent(formData.email)}`)
          }, 3000)
          return
        }
        throw signUpError
      }

      if (!authData.user) throw new Error('No user data returned from signup')

      logger.debug('Auth account created successfully:', authData.user.id)

      // Store role in localStorage as fallback
      localStorage.setItem('pending_role', selectedRole)
      localStorage.setItem('pending_email', formData.email)

      logger.debug('Redirecting to /verify-email')

      // Redirect to verify email page
      navigate(`/verify-email?email=${encodeURIComponent(formData.email)}`)

    } catch (err) {
      logger.error('Sign up error:', err)
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0">
        <img 
          src="/hero-desktop.webp"
          alt="Field Hockey"
          className="w-full h-full object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl animate-scale-in overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
            <div className="flex items-center gap-3 mb-2">
              <img
                src="/WhiteLogo.svg"
                alt="PLAYR"
                className="h-8"
              />
            </div>
            <p className="text-white/90 text-sm">
              Create your account and start your field hockey journey
            </p>
          </div>

          {/* Role Selection */}
          {!selectedRole && (
            <div className="p-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2 text-center">Join PLAYR</h3>
              <p className="text-gray-600 mb-8 text-center">Select your role to get started</p>

              <div className="space-y-4">
                <button
                  onClick={() => setSelectedRole('player')}
                  className="w-full flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-[#6366f1] hover:bg-[#6366f1]/5 transition-all group"
                >
                  <div className="w-14 h-14 rounded-full bg-[#6366f1]/10 group-hover:bg-[#6366f1] flex items-center justify-center transition-colors">
                    <User className="w-7 h-7 text-[#6366f1] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="text-lg font-bold text-gray-900 mb-1">Join as Player</h4>
                    <p className="text-sm text-gray-600">Showcase your skills and connect with clubs</p>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedRole('coach')}
                  className="w-full flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-[#8b5cf6] hover:bg-[#8b5cf6]/5 transition-all group"
                >
                  <div className="w-14 h-14 rounded-full bg-[#8b5cf6]/10 group-hover:bg-[#8b5cf6] flex items-center justify-center transition-colors">
                    <Briefcase className="w-7 h-7 text-[#8b5cf6] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="text-lg font-bold text-gray-900 mb-1">Join as Coach</h4>
                    <p className="text-sm text-gray-600">Find opportunities and mentor players</p>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedRole('club')}
                  className="w-full flex items-center gap-4 p-6 border-2 border-gray-200 rounded-xl hover:border-[#ec4899] hover:bg-[#ec4899]/5 transition-all group"
                >
                  <div className="w-14 h-14 rounded-full bg-[#ec4899]/10 group-hover:bg-[#ec4899] flex items-center justify-center transition-colors">
                    <Building2 className="w-7 h-7 text-[#ec4899] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 text-left">
                    <h4 className="text-lg font-bold text-gray-900 mb-1">Join as Club</h4>
                    <p className="text-sm text-gray-600">Discover talent and build your team</p>
                  </div>
                </button>
              </div>

              <div className="mt-6 text-center">
                <button
                  onClick={() => navigate('/')}
                  className="text-sm text-[#6366f1] hover:text-[#4f46e5] font-medium"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </div>
          )}

          {/* Email + Password Form */}
          {selectedRole && (
            <form onSubmit={handleSubmit} className="p-8">
              <button
                type="button"
                onClick={() => setSelectedRole(null)}
                className="mb-6 text-sm text-[#6366f1] hover:text-[#4f46e5] font-medium"
              >
                ← Back to role selection
              </button>

              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                {selectedRole === 'player' && 'Join as Player'}
                {selectedRole === 'coach' && 'Join as Coach'}
                {selectedRole === 'club' && 'Join as Club'}
              </h3>
              <p className="text-gray-600 mb-6">
                Enter your email and password to create your account
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  icon={<Mail className="w-5 h-5" />}
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a password (min. 8 characters)"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters long</p>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </Button>

              <p className="text-xs text-gray-500 mt-4 text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
