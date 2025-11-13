import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth'
import PlayerDashboard from './PlayerDashboard'
import CoachDashboard from './CoachDashboard'
import ClubDashboard from './ClubDashboard'

/**
 * DashboardRouter - Single source of truth for profile-based routing
 * 
 * This component is the ONLY place that makes routing decisions based on profile state.
 * 
 * Routing logic:
 * 1. No user → redirect to landing page
 * 2. User but no profile → wait (profile is being fetched)
 * 3. User with incomplete profile → redirect to /complete-profile (once only)
 * 4. User with complete profile → render role-based dashboard
 * 
 * Uses persistent state (hasCompletedOnboardingRedirect) to prevent redirect loops
 */
export default function DashboardRouter() {
  const navigate = useNavigate()
  const { user, profile, loading, hasCompletedOnboardingRedirect, setHasCompletedOnboardingRedirect, profileStatus } = useAuthStore()

  useEffect(() => {
    console.log('[DASHBOARD_ROUTER]', {
      loading,
      hasUser: !!user,
      hasProfile: !!profile,
      fullName: profile?.full_name,
      // onboarding_completed field exists in DB but not in types yet
      hasCompletedOnboardingRedirect,
      profileStatus
    })

    // Wait for auth to finish loading
    if (loading) return

    // No user → redirect to landing
    if (!user) {
      console.log('[DASHBOARD_ROUTER] No user, redirecting to landing')
      navigate('/', { replace: true })
      return
    }

    // No profile yet
    if (!profile) {
      if (profileStatus === 'missing') {
        console.log('[DASHBOARD_ROUTER] Profile missing, routing to /complete-profile')
        if (!hasCompletedOnboardingRedirect) {
          setHasCompletedOnboardingRedirect(true)
        }
        navigate('/complete-profile', { replace: true })
      } else {
        console.log('[DASHBOARD_ROUTER] No profile yet, waiting...')
      }
      return
    }

    // Profile exists but incomplete (no full_name) → route to complete-profile
    // Only attempt redirect once to prevent loops
    if (!profile.full_name && !hasCompletedOnboardingRedirect) {
      setHasCompletedOnboardingRedirect(true)
      console.log('[DASHBOARD_ROUTER] Profile incomplete (no full_name), routing to /complete-profile')
      navigate('/complete-profile', { replace: true })
      return
    }

    // Profile complete → continue to render dashboard below
    if (profile.full_name) {
      console.log('[DASHBOARD_ROUTER] Profile complete, rendering dashboard')
      if (hasCompletedOnboardingRedirect) {
        setHasCompletedOnboardingRedirect(false)
      }
    }

  }, [user, profile, loading, navigate, hasCompletedOnboardingRedirect, setHasCompletedOnboardingRedirect, profileStatus])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#6366f1] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No profile found. Please complete your profile.</p>
          <button
            onClick={() => navigate('/complete-profile')}
            className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Complete Profile
          </button>
        </div>
      </div>
    )
  }

  // If profile incomplete, show loading (useEffect will redirect)
  if (!profile.full_name) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#6366f1] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    )
  }

  // Route based on role
  if (profile.role === 'player') {
    return <PlayerDashboard />
  }
  
  if (profile.role === 'coach') {
    return <CoachDashboard />
  }
  
  return <ClubDashboard />
}
