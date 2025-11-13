import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { X, Upload, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import type { Profile } from '@/lib/supabase'
import { Button, Input } from '@/components'
import { logger } from '@/lib/logger'
import { optimizeImage, validateImage } from '@/lib/imageOptimization'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { invalidateProfile } from '@/lib/profile'
import { useToastStore } from '@/lib/toast'

interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
  role: 'player' | 'coach' | 'club'
}

export default function EditProfileModal({ isOpen, onClose, role }: EditProfileModalProps) {
  const { profile, setProfile } = useAuthStore()
  const { addToast } = useToastStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const titleId = useId()

  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    base_location: profile?.base_location || '',
    nationality: profile?.nationality || '',
    date_of_birth: profile?.date_of_birth || '',
    position: profile?.position || '',
    secondary_position: profile?.secondary_position || '',
    gender: profile?.gender || '',
    passport_1: profile?.passport_1 || '',
    passport_2: profile?.passport_2 || '',
    current_club: profile?.current_club || '',
    year_founded: profile?.year_founded?.toString() || '',
    league_division: profile?.league_division || '',
    website: profile?.website || '',
    contact_email: profile?.contact_email || '',
    club_bio: profile?.club_bio || '',
    club_history: profile?.club_history || '',
    bio: profile?.bio || '',
    avatar_url: profile?.avatar_url || '',
  })

  const handleDismiss = useCallback(() => {
    if (loading) {
      return
    }
    onClose()
  }, [loading, onClose])

  useFocusTrap({ containerRef: dialogRef, isActive: isOpen && Boolean(profile), initialFocusRef: closeButtonRef })

  useEffect(() => {
    if (!isOpen || !profile) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        handleDismiss()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleDismiss, isOpen, profile])

  if (!isOpen || !profile) return null

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    try {
      // Validate image
      const validation = validateImage(file);
      if (!validation.valid) {
        setError(validation.error || 'Invalid image');
        return;
      }

      // Optimize image before upload
      logger.debug('Optimizing avatar image...')
      const optimizedFile = await optimizeImage(file, {
        maxWidth: 800, // Avatars don't need to be huge
        maxHeight: 800,
        maxSizeMB: 0.5, // 500KB max for avatars
        quality: 0.85
      });

      const fileExt = optimizedFile.name.split('.').pop();
      const fileName = `${profile.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, optimizedFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      setFormData({ ...formData, avatar_url: publicUrl });
      logger.info('Avatar uploaded successfully')
    } catch (error) {
      logger.error('Error uploading avatar:', error);
      setError('Failed to upload avatar');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (role === 'player' && formData.secondary_position && formData.secondary_position === formData.position) {
      setError('Primary and secondary positions must be different.')
      return
    }

    setLoading(true)

    // Create optimistic update object
    const optimisticUpdate: Record<string, unknown> = {
      full_name: formData.full_name,
      base_location: formData.base_location,
      avatar_url: formData.avatar_url || null,
    }

    if (role === 'player') {
      optimisticUpdate.nationality = formData.nationality
      optimisticUpdate.position = formData.position
      optimisticUpdate.secondary_position = formData.secondary_position || null
      optimisticUpdate.gender = formData.gender
      optimisticUpdate.date_of_birth = formData.date_of_birth || null
      optimisticUpdate.passport_1 = formData.passport_1 || null
      optimisticUpdate.passport_2 = formData.passport_2 || null
      optimisticUpdate.current_club = formData.current_club || null
      optimisticUpdate.bio = formData.bio || null
    } else if (role === 'coach') {
      optimisticUpdate.nationality = formData.nationality
      optimisticUpdate.gender = formData.gender || null
      optimisticUpdate.date_of_birth = formData.date_of_birth || null
      optimisticUpdate.passport_1 = formData.passport_1 || null
      optimisticUpdate.passport_2 = formData.passport_2 || null
      optimisticUpdate.bio = formData.bio || null
      optimisticUpdate.contact_email = formData.contact_email || null
    } else if (role === 'club') {
      optimisticUpdate.nationality = formData.nationality
      optimisticUpdate.year_founded = formData.year_founded ? parseInt(formData.year_founded) : null
      optimisticUpdate.league_division = formData.league_division || null
      optimisticUpdate.website = formData.website || null
      optimisticUpdate.contact_email = formData.contact_email || null
      optimisticUpdate.club_bio = formData.club_bio || null
      optimisticUpdate.club_history = formData.club_history || null
    }

    const previousProfile = profile
    const profileId = profile.id
    const optimisticProfile = previousProfile
      ? ({ ...previousProfile, ...optimisticUpdate } as Profile)
      : null

    if (optimisticProfile) {
      setProfile(optimisticProfile)
    }

    // Optimistically close modal so updated values are visible on dashboard right away
    onClose()
    
    try {
      logger.debug('Attempting to update profile with data:', optimisticUpdate)
      logger.debug('Profile ID:', profile.id)
      logger.debug('Role:', role)

      // Update profile in database
      const { data, error: updateError } = await supabase
        .from('profiles')
        .update(optimisticUpdate)
        .eq('id', profileId)
        .select('*')
        .single()

      logger.debug('Update response data:', data)
      logger.debug('Update error:', updateError)

      if (updateError) {
        logger.error('Supabase update error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        })
        throw updateError
      }

      if (data) {
        setProfile(data as Profile)
      }

      // Force refresh from server to pick up computed fields/triggers
      await invalidateProfile({ userId: profileId, reason: 'profile-updated' })
    } catch (err) {
      logger.error('Profile update error:', err)
      logger.error('Error type:', typeof err)
      logger.error('Error object:', JSON.stringify(err, null, 2))
      if (previousProfile) {
        setProfile(previousProfile)
      }
      await invalidateProfile({ userId: profileId, reason: 'profile-update-retry' })
      // Show error but don't reopen modal - user already sees their changes
      addToast('Some profile changes may not have saved. Please refresh the page.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="presentation">
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id={titleId} className="text-2xl font-bold text-gray-900">
            Edit {role === 'club' ? 'Club' : role === 'coach' ? 'Coach' : 'Player'} Profile
          </h2>
          <button
            ref={closeButtonRef}
            onClick={handleDismiss}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
            title="Close"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Avatar Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {role === 'club' ? 'Club Logo' : 'Profile Picture'}
              </label>
              <div className="flex items-center gap-4">
                <div 
                  onClick={handleImageClick}
                  className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors overflow-hidden"
                >
                  {formData.avatar_url ? (
                    <img src={formData.avatar_url} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={handleImageClick}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                  >
                    {formData.avatar_url ? 'Change Image' : 'Upload Image'}
                  </button>
                  <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                aria-label="Profile picture upload"
              />
            </div>

            {/* Common Fields */}
            <Input
              label={role === 'club' ? 'Club Name' : 'Full Name'}
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />

            <Input
              label="Base Location (City)"
              placeholder="Where are you currently based?"
              value={formData.base_location}
              onChange={(e) => setFormData({ ...formData, base_location: e.target.value })}
              required
            />

            <Input
              label="Country"
              value={formData.nationality}
              onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
              required
            />

            {/* Player-specific fields */}
            {role === 'player' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="player-position">
                    Position
                  </label>
                  <select
                    id="player-position"
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    required
                    aria-label="Select position"
                  >
                    <option value="">Select position</option>
                    <option value="Goalkeeper">Goalkeeper</option>
                    <option value="Defender">Defender</option>
                    <option value="Midfielder">Midfielder</option>
                    <option value="Forward">Forward</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="player-secondary-position">
                    Second Position (Optional)
                  </label>
                  <select
                    id="player-secondary-position"
                    value={formData.secondary_position}
                    onChange={(e) => setFormData({ ...formData, secondary_position: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    aria-label="Select secondary position"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="player-gender">
                    Gender
                  </label>
                  <select
                    id="player-gender"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    required
                    aria-label="Select gender"
                  >
                    <option value="">Select gender</option>
                    <option value="Men">Men</option>
                    <option value="Women">Women</option>
                  </select>
                </div>

                <Input
                  label="Date of Birth (Optional)"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />

                <Input
                  label="Passport 1 (Required)"
                  type="text"
                  value={formData.passport_1}
                  onChange={(e) => setFormData({ ...formData, passport_1: e.target.value })}
                  placeholder="e.g., New Zealand Passport"
                  required
                />

                <Input
                  label="Passport 2 (Optional)"
                  type="text"
                  value={formData.passport_2}
                  onChange={(e) => setFormData({ ...formData, passport_2: e.target.value })}
                  placeholder="e.g., Australian Passport"
                />

                <Input
                  label="Current Club (Optional)"
                  type="text"
                  value={formData.current_club}
                  onChange={(e) => setFormData({ ...formData, current_club: e.target.value })}
                  placeholder="e.g., Holcombe Hockey Club"
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="player-bio">
                    About Me (Optional)
                  </label>
                  <textarea
                    id="player-bio"
                    value={formData.bio || ''}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
                    placeholder="Share your playing background, strengths, and goals"
                    aria-label="About me"
                  />
                </div>
              </>
            )}

            {/* Coach-specific fields */}
            {role === 'coach' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="coach-gender-edit">
                    Gender
                  </label>
                  <select
                    id="coach-gender-edit"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <Input
                  label="Date of Birth (Optional)"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />

                <Input
                  label="Passport 1 (Optional)"
                  placeholder="Primary passport/nationality"
                  value={formData.passport_1}
                  onChange={(e) => setFormData({ ...formData, passport_1: e.target.value })}
                />

                <Input
                  label="Passport 2 (Optional)"
                  placeholder="Secondary passport/nationality"
                  value={formData.passport_2}
                  onChange={(e) => setFormData({ ...formData, passport_2: e.target.value })}
                />

                <Input
                  label="Contact Email (Optional)"
                  type="email"
                  placeholder="contact@example.com"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                />

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bio (Optional)
                  </label>
                  <textarea
                    value={formData.bio || ''}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
                    placeholder="Tell us about your coaching experience..."
                  />
                </div>
              </>
            )}

            {/* Club-specific fields */}
            {role === 'club' && (
              <>
                <Input
                  label="Year Founded (Optional)"
                  type="number"
                  value={formData.year_founded}
                  onChange={(e) => setFormData({ ...formData, year_founded: e.target.value })}
                />

                <Input
                  label="League/Division (Optional)"
                  value={formData.league_division}
                  onChange={(e) => setFormData({ ...formData, league_division: e.target.value })}
                />

                <Input
                  label="Website (Optional)"
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />

                <Input
                  label="Contact Email (Optional)"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                />

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="club-bio">
                  Bio
                </label>
                <textarea
                  id="club-bio"
                  value={formData.club_bio || ''}
                  onChange={(e) => setFormData({ ...formData, club_bio: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-yellow-400 focus:outline-none resize-none"
                  placeholder="Tell us about your club..."
                  aria-label="Club bio"
                />
              </div>                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2" htmlFor="club-history">
                    Club History (Optional)
                  </label>
                  <textarea
                    id="club-history"
                    value={formData.club_history}
                    onChange={(e) => setFormData({ ...formData, club_history: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8b5cf6] focus:border-transparent"
                    rows={3}
                    placeholder="Tell us about your club's history..."
                    aria-label="Club history"
                  />
                </div>
              </>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin inline" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
