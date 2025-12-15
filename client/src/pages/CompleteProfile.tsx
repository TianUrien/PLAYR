import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, MapPin, Globe, Calendar, Building2, Camera } from 'lucide-react'
import * as Sentry from '@sentry/react'
import { Input, Button, CountrySelect } from '@/components'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { optimizeAvatarImage, validateImage } from '@/lib/imageOptimization'
import { invalidateProfile } from '@/lib/profile'
import { deleteStorageObject } from '@/lib/storage'

type UserRole = 'player' | 'coach' | 'club'

/**
 * CompleteProfile - Step 2 of signup (POST email verification)
 * 
 * SIMPLIFIED APPROACH:
 * - Uses global auth store (useAuthStore) for user and profile data
 * - No duplicate profile fetching (auth store handles it)
 * - No complex profile creation logic (DB trigger handles it)
 * - Focus on form submission and data update only
 * 
 * Flow:
 * 1. User has verified email and active session (from AuthCallback)
 * 2. Auth store has fetched profile (from initializeAuth)
 * 3. User fills form with complete details
 * 4. Update profile row with full data + onboarding_completed flag
 * 5. Refresh auth store and navigate to dashboard
 */
export default function CompleteProfile() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const profilePrefilledRef = useRef(false)
  const contactPrefilledRef = useRef<string | null>(null)
  const { user, profile, loading: authLoading, profileStatus } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string>(profile?.avatar_url || '')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [fallbackRole, setFallbackRole] = useState<UserRole | null>(null)
  const [fallbackEmail, setFallbackEmail] = useState<string>('')

  // Form data states
  const [formData, setFormData] = useState({
    fullName: '',
    clubName: '',
    city: '',
    nationality: '',
    nationalityCountryId: null as number | null,
    nationality2CountryId: null as number | null,
    country: '',
    dateOfBirth: '',
    position: '',
    secondaryPosition: '',
    gender: '',
    yearFounded: '',
    womensLeagueDivision: '',
    mensLeagueDivision: '',
    website: '',
    contactEmail: '',
    clubBio: '',
    clubHistory: '',
  })

  const normalizeGender = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const lower = trimmed.toLowerCase()
    if (lower === 'men' || lower === 'male') return 'Men'
    if (lower === 'women' || lower === 'female') return 'Women'
    return 'Other'
  }

  // Use profile data from auth store - no need to fetch again
  const userRole = (profile?.role as UserRole | null) ?? fallbackRole ?? (user?.user_metadata?.role as UserRole | undefined) ?? null
  const contactEmailFallback = profile?.contact_email ?? profile?.email ?? user?.email ?? fallbackEmail ?? ''

  const captureOnboardingError = (error: unknown, payload: Record<string, unknown>, sourceComponent: string) => {
    Sentry.captureException(error, {
      tags: { feature: 'onboarding_profile' },
      extra: {
        userId: user?.id ?? null,
        payload,
        sourceComponent,
      },
    })
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedRole = window.localStorage.getItem('pending_role') as UserRole | null
      const storedEmail = window.localStorage.getItem('pending_email') || ''
      if (storedRole && !fallbackRole) {
        setFallbackRole(storedRole)
      }
      if (storedEmail && !fallbackEmail) {
        setFallbackEmail(storedEmail)
      }
    }
  }, [fallbackRole, fallbackEmail])

  useEffect(() => {
    console.log('[COMPLETE_PROFILE]', {
      authLoading,
      hasUser: !!user,
      hasProfile: !!profile,
      role: profile?.role,
      fullName: profile?.full_name,
      profileStatus
    })

    // Wait for auth to load
    if (authLoading || (profileStatus === 'fetching' && !profile)) return

    // No user → redirect to signup
    if (!user) {
      console.log('[COMPLETE_PROFILE] No user, redirecting to signup')
      navigate('/signup', { replace: true })
    }
  }, [user, profile, authLoading, navigate, profileStatus])

  useEffect(() => {
    if (!contactEmailFallback) {
      return
    }

    setFormData(prev => {
      if (prev.contactEmail && prev.contactEmail !== contactPrefilledRef.current) {
        return prev
      }
      contactPrefilledRef.current = contactEmailFallback
      return { ...prev, contactEmail: contactEmailFallback }
    })
  }, [contactEmailFallback])

  useEffect(() => {
    if (!profile || profilePrefilledRef.current) {
      return
    }

    profilePrefilledRef.current = true
    setFormData(prev => {
      const next = { ...prev }
      next.city = profile.base_location ?? prev.city
      next.nationality = profile.nationality ?? prev.nationality

      if (profile.role === 'club') {
        next.clubName = profile.full_name ?? prev.clubName
        next.country = profile.nationality ?? prev.country
        next.yearFounded = profile.year_founded ? String(profile.year_founded) : prev.yearFounded
        next.womensLeagueDivision = (profile as unknown as { womens_league_division?: string | null }).womens_league_division ?? prev.womensLeagueDivision
        next.mensLeagueDivision = (profile as unknown as { mens_league_division?: string | null }).mens_league_division ?? prev.mensLeagueDivision
        next.website = profile.website ?? prev.website
        next.contactEmail = profile.contact_email ?? next.contactEmail
        next.clubBio = profile.club_bio ?? prev.clubBio
        next.clubHistory = profile.club_history ?? prev.clubHistory
      } else {
        next.fullName = profile.full_name ?? prev.fullName
        next.gender = profile.gender ?? prev.gender
        next.dateOfBirth = profile.date_of_birth ?? prev.dateOfBirth

        if (profile.role === 'player') {
          next.position = profile.position ?? prev.position
          next.secondaryPosition = profile.secondary_position ?? prev.secondaryPosition
        }
      }

      return next
    })

    if (profile.contact_email) {
      contactPrefilledRef.current = profile.contact_email
    }

    if (profile.avatar_url) {
      setAvatarUrl(profile.avatar_url)
    }
  }, [profile])

  // Handle avatar upload
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !user) return

    try {
      setUploadingAvatar(true)
      setError('')

      // Validate image
      const validation = validateImage(file, { maxFileSizeMB: 5 })
      if (!validation.valid) {
        setError(validation.error || 'Invalid image')
        return
      }

      // Optimize image before upload
      logger.debug('Optimizing avatar image...')
      const optimizedFile = await optimizeAvatarImage(file)

      const fileExt = optimizedFile.name.split('.').pop() || 'jpg'
      const filePath = `${user.id}/avatar_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, optimizedFile, { upsert: true })

      if (uploadError) {
        captureOnboardingError(uploadError, {
          role: userRole,
          hasUser: Boolean(user?.id),
          fileSizeBytes: optimizedFile.size,
        }, 'CompleteProfile.handleAvatarUpload.upload')
        throw uploadError
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      const previousUrl = avatarUrl || profile?.avatar_url || null
      setAvatarUrl(publicUrl)
      if (previousUrl && previousUrl !== publicUrl) {
        await deleteStorageObject({ bucket: 'avatars', publicUrl: previousUrl, context: 'complete-profile:replace-avatar' })
      }
      logger.info('Avatar uploaded successfully')
    } catch (err) {
      captureOnboardingError(err, {
        stage: 'avatarUploadCatch',
        role: userRole,
        hasUser: Boolean(user?.id),
      }, 'CompleteProfile.handleAvatarUpload.catch')
      logger.error('Error uploading avatar:', err)
      setError('We couldn’t upload this image. Please use PNG or JPG up to 5MB.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  // Client-side validation
  const validateForm = (): string | null => {
    if (userRole === 'player') {
      if (!formData.fullName.trim()) return 'Full name is required.'
      if (!formData.city.trim()) return 'Base location is required.'
      if (!formData.nationalityCountryId) return 'Nationality is required.'
      if (!formData.position) return 'Position is required.'
      if (!formData.gender) return 'Gender is required.'
      if (formData.secondaryPosition && formData.secondaryPosition === formData.position) {
        return 'Primary and secondary positions must be different.'
      }
    } else if (userRole === 'coach') {
      if (!formData.fullName.trim()) return 'Full name is required.'
      if (!formData.city.trim()) return 'Base location is required.'
      if (!formData.nationalityCountryId) return 'Nationality is required.'
      if (!formData.gender) return 'Gender is required.'
    } else if (userRole === 'club') {
      if (!formData.clubName.trim()) return 'Club name is required.'
      if (!formData.city.trim()) return 'City is required.'
      if (!formData.country.trim()) return 'Country is required.'
      if (!formData.contactEmail.trim()) return 'Contact email is required.'
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.contactEmail)) {
        return 'Please enter a valid email address.'
      }
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Run client-side validation first
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    
    setLoading(true)
    let lastUpdatedFields: string[] = []

    try {
      if (!user) {
        throw new Error('Session not found')
      }

      if (!userRole) {
        throw new Error('Profile role not found')
      }

      // Prepare data based on role
      const profileNationality = userRole === 'club' ? formData.country : formData.nationality

      let updateData: Record<string, unknown> = {
        role: userRole, // IMPORTANT: Always include role in update
        full_name: formData.fullName || formData.clubName || '',
        base_location: formData.city || '',
        nationality: profileNationality || '',
        nationality_country_id: formData.nationalityCountryId,
        onboarding_completed: true, // Mark onboarding as complete
        avatar_url: avatarUrl || null, // Include avatar if uploaded
      }

      if (userRole === 'player') {
        updateData = {
          ...updateData,
          nationality2_country_id: formData.nationality2CountryId,
          position: formData.position,
          secondary_position: formData.secondaryPosition || null,
          gender: normalizeGender(formData.gender),
          date_of_birth: formData.dateOfBirth || null,
        }
      } else if (userRole === 'coach') {
        updateData = {
          ...updateData,
          nationality2_country_id: formData.nationality2CountryId,
          gender: normalizeGender(formData.gender),
          date_of_birth: formData.dateOfBirth || null,
        }
      } else if (userRole === 'club') {
        updateData = {
          ...updateData,
          full_name: formData.clubName,
          base_location: formData.city, // City is stored in base_location
          nationality: profileNationality || '',
          year_founded: formData.yearFounded ? parseInt(formData.yearFounded) : null,
          womens_league_division: formData.womensLeagueDivision || null,
          mens_league_division: formData.mensLeagueDivision || null,
          website: formData.website,
          contact_email: formData.contactEmail,
          club_bio: formData.clubBio,
          club_history: formData.clubHistory,
        }
      }

      logger.debug('Updating profile with data:', updateData)
      lastUpdatedFields = Object.keys(updateData)

      // Update profile
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select('*')
        .single()

      if (updateError) {
        captureOnboardingError(updateError, {
          role: userRole,
          updatedFields: lastUpdatedFields,
        }, 'CompleteProfile.handleSubmit.updateProfile')
        logger.error('Error updating profile:', updateError)
        throw new Error(`Failed to update profile: ${updateError.message}`)
      }

      if (!updatedProfile) {
        throw new Error('Profile update did not return data. Please try again.')
      }

      logger.debug('Profile updated successfully')

      // Fetch the updated profile to verify (additional safety)
      const { data: verifiedProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (fetchError || !verifiedProfile) {
        if (fetchError) {
          captureOnboardingError(fetchError, {
            role: userRole,
            stage: 'verifyProfileAfterUpdate',
          }, 'CompleteProfile.handleSubmit.verifyProfileFetch')
        }
        logger.error('Error fetching updated profile:', fetchError)
        throw new Error('Profile updated but could not verify. Please refresh the page.')
      }

      logger.debug('Updated profile verified:', verifiedProfile)

      // CRITICAL: Refresh the auth store so dependent routes pick up the update
      await invalidateProfile({ userId: user.id, reason: 'complete-profile' })
      
      logger.debug('Auth store refreshed - profile now complete')
      navigate('/dashboard/profile', { replace: true })

    } catch (err) {
      captureOnboardingError(err, {
        stage: 'handleSubmitCatch',
        role: userRole,
        updatedFields: lastUpdatedFields,
      }, 'CompleteProfile.handleSubmit.catch')
      logger.error('Complete profile error:', err)
      setError(err instanceof Error ? err.message : 'Failed to complete profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Show loading while auth is initializing
  if (authLoading || (profileStatus === 'fetching' && !profile)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#6366f1] mb-4"></div>
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    )
  }

  // Show error if no user or profile role
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Error</h2>
          <p className="text-gray-600 mb-6">
            {'No session found. Please sign in again.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.054 0 1.62-1.14 1.054-2.054L13.054 4.946c-.527-.894-1.581-.894-2.108 0L4.928 16.946C4.362 17.86 4.928 19 5.982 19z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">We Need Your Role</h2>
          <p className="text-gray-600 mb-6">
            We could not determine your role from signup. Please return to the signup page and choose your role again.
          </p>
          <button
            onClick={() => navigate('/signup')}
            className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Go to Sign Up
          </button>
        </div>
      </div>
    )
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
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
            <div className="flex items-center gap-3 mb-2">
              <img
                src="/WhiteLogo.svg"
                alt="PLAYR"
                className="h-8"
              />
            </div>
            <p className="text-white/90 text-sm">
              Complete your profile to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-8 max-h-[80vh] overflow-y-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              {userRole === 'player' && 'Complete Player Profile'}
              {userRole === 'coach' && 'Complete Coach Profile'}
              {userRole === 'club' && 'Complete Club Profile'}
            </h3>
            <p className="text-gray-600 mb-6">Fill in your details below</p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Avatar Upload Section - Optional */}
            <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Profile Photo <span className="text-gray-500">(Optional)</span>
              </label>
              <div className="flex items-center gap-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center cursor-pointer hover:from-purple-200 hover:to-indigo-200 transition-all overflow-hidden border-2 border-white shadow-md"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-purple-600" />
                  )}
                </div>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 rounded-lg transition-colors text-sm font-medium border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingAvatar ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                        Uploading...
                      </span>
                    ) : avatarUrl ? (
                      'Change Photo'
                    ) : (
                      'Upload Photo'
                    )}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">PNG or JPG, up to 5MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={uploadingAvatar}
                aria-label="Upload profile photo"
              />
            </div>

            <div className="space-y-4">
              {/* Player Form */}
              {userRole === 'player' && (
                <>
                  <Input
                    label="Full Name"
                    icon={<User className="w-5 h-5" />}
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />

                  <Input
                    label="Base Location (City)"
                    icon={<MapPin className="w-5 h-5" />}
                    placeholder="Where are you currently based?"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                  />

                  <CountrySelect
                    label="Nationality"
                    value={formData.nationalityCountryId}
                    onChange={(id) => setFormData({ ...formData, nationalityCountryId: id })}
                    placeholder="Select your nationality"
                    showNationality
                    required
                  />

                  <div>
                    <label htmlFor="position-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Position <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="position-select"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      required
                    >
                      <option value="">Select your position</option>
                      <option value="Goalkeeper">Goalkeeper</option>
                      <option value="Defender">Defender</option>
                      <option value="Midfielder">Midfielder</option>
                      <option value="Forward">Forward</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="secondary-position-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Second Position (Optional)
                    </label>
                    <select
                      id="secondary-position-select"
                      value={formData.secondaryPosition}
                      onChange={(e) => setFormData({ ...formData, secondaryPosition: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    >
                      <option value="">No secondary position</option>
                      {['Goalkeeper', 'Defender', 'Midfielder', 'Forward'].map((option) => (
                        <option key={option} value={option} disabled={option === formData.position}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="gender-select" className="block text-sm font-medium text-gray-700 mb-2">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="gender-select"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="Men">Men</option>
                      <option value="Women">Women</option>
                    </select>
                  </div>

                  <Input
                    label="Date of Birth (Optional)"
                    type="date"
                    icon={<Calendar className="w-5 h-5" />}
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </>
              )}

              {/* Coach Form */}
              {userRole === 'coach' && (
                <>
                  <Input
                    label="Full Name"
                    icon={<User className="w-5 h-5" />}
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    required
                  />

                  <Input
                    label="Base Location (City)"
                    icon={<MapPin className="w-5 h-5" />}
                    placeholder="Where are you currently based?"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                  />

                  <CountrySelect
                    label="Nationality"
                    value={formData.nationalityCountryId}
                    onChange={(id) => setFormData({ ...formData, nationalityCountryId: id })}
                    placeholder="Select your nationality"
                    showNationality
                    required
                  />

                  <CountrySelect
                    label="Secondary Nationality (Optional)"
                    value={formData.nationality2CountryId}
                    onChange={(id) => setFormData({ ...formData, nationality2CountryId: id })}
                    placeholder="Select secondary nationality"
                    showNationality
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coach-gender">
                      Gender
                    </label>
                    <select
                      id="coach-gender"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      required
                    >
                      <option value="">Select gender</option>
                      <option value="Men">Men</option>
                      <option value="Women">Women</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <Input
                    label="Date of Birth"
                    type="date"
                    icon={<Calendar className="w-5 h-5" />}
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                  />
                </>
              )}

              {/* Club Form */}
              {userRole === 'club' && (
                <>
                  <Input
                    label="Club Name"
                    icon={<Building2 className="w-5 h-5" />}
                    placeholder="Enter your club name"
                    value={formData.clubName}
                    onChange={(e) => setFormData({ ...formData, clubName: e.target.value })}
                    required
                  />

                  <Input
                    label="City"
                    icon={<MapPin className="w-5 h-5" />}
                    placeholder="Club location"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    required
                  />

                  <Input
                    label="Country"
                    icon={<Globe className="w-5 h-5" />}
                    placeholder="Country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    required
                  />

                  <Input
                    label="Year Founded (Optional)"
                    type="number"
                    placeholder="YYYY"
                    value={formData.yearFounded}
                    onChange={(e) => setFormData({ ...formData, yearFounded: e.target.value })}
                  />

                  <Input
                    label="Women’s League / Division (Optional)"
                    placeholder="e.g. Serie A1"
                    value={formData.womensLeagueDivision}
                    onChange={(e) => setFormData({ ...formData, womensLeagueDivision: e.target.value })}
                  />

                  <Input
                    label="Men’s League / Division (Optional)"
                    placeholder="e.g. Elite Division"
                    value={formData.mensLeagueDivision}
                    onChange={(e) => setFormData({ ...formData, mensLeagueDivision: e.target.value })}
                  />

                  <Input
                    label="Website (Optional)"
                    type="url"
                    placeholder="https://yourclub.com"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />

                  <Input
                    label="Contact Email"
                    type="email"
                    placeholder="contact@club.com"
                    value={formData.contactEmail}
                    onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    required
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Club Bio (Optional)
                    </label>
                    <textarea
                      value={formData.clubBio}
                      onChange={(e) => setFormData({ ...formData, clubBio: e.target.value })}
                      placeholder="Tell us about your club..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      rows={4}
                    />
                  </div>
                </>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
            >
              {loading ? 'Saving Profile...' : 'Complete Profile'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
