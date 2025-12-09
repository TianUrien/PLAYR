import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { CoachProfileShape } from '@/pages/CoachDashboard'

export interface ProfileBucket {
  id: string
  label: string
  /** Description shown when incomplete */
  hint: string
  /** Weight out of 100 */
  weight: number
  /** True when this bucket is fully completed */
  completed: boolean
  /** Optional action id the parent can handle (e.g. "add-bio", "open-gallery") */
  actionId?: string
  /** Label for the CTA button */
  actionLabel?: string
}

interface UseCoachProfileStrengthOptions {
  profile: CoachProfileShape | null
}

/**
 * Coach-specific profile strength calculation.
 *
 * Buckets:
 * - Basic Info (25%): full_name, nationality, base_location, date_of_birth, gender
 * - Profile Photo (20%): avatar_url present
 * - Professional Bio (20%): bio field filled
 * - Experience/Journey (20%): at least 1 playing_history entry
 * - Media Gallery (15%): at least 1 gallery_photos entry
 */
export function useCoachProfileStrength({ profile }: UseCoachProfileStrengthOptions) {
  const [journeyCount, setJourneyCount] = useState<number | null>(null)
  const [galleryCount, setGalleryCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const profileId = profile?.id ?? null

  // Fetch counts for journey and gallery
  const fetchCounts = useCallback(async () => {
    if (!profileId) {
      setJourneyCount(null)
      setGalleryCount(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [journeyRes, galleryRes] = await Promise.all([
        supabase
          .from('playing_history')
          .select('id', { count: 'exact', head: true })
          .eq('profile_id', profileId),
        supabase
          .from('gallery_photos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profileId),  // gallery_photos uses user_id, not profile_id
      ])
      setJourneyCount(journeyRes.count ?? 0)
      setGalleryCount(galleryRes.count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    void fetchCounts()
  }, [fetchCounts])

  // Check if all basic info fields are filled
  const isBasicInfoComplete = useCallback(() => {
    if (!profile) return false
    const { full_name, nationality, base_location, date_of_birth, gender } = profile
    return Boolean(
      full_name?.trim() &&
        nationality?.trim() &&
        base_location?.trim() &&
        date_of_birth?.trim() &&
        gender?.trim()
    )
  }, [profile])

  // Check profile photo
  const hasProfilePhoto = useCallback(() => {
    if (!profile) return false
    return Boolean(profile.avatar_url?.trim())
  }, [profile])

  // Check professional bio
  const hasProfessionalBio = useCallback(() => {
    if (!profile) return false
    return Boolean(profile.bio?.trim())
  }, [profile])

  // Build buckets
  const buckets: ProfileBucket[] = useMemo(() => {
    const basicComplete = isBasicInfoComplete()
    const photoComplete = hasProfilePhoto()
    const bioComplete = hasProfessionalBio()
    const journeyComplete = (journeyCount ?? 0) >= 1
    const galleryComplete = (galleryCount ?? 0) >= 1

    return [
      {
        id: 'basic',
        label: 'Basic Info',
        hint: 'Complete name, nationality, location, DOB, and gender',
        weight: 25,
        completed: basicComplete,
        actionId: 'edit-profile',
        actionLabel: 'Edit Profile',
      },
      {
        id: 'photo',
        label: 'Profile Photo',
        hint: 'Upload a profile photo',
        weight: 20,
        completed: photoComplete,
        actionId: 'edit-profile',
        actionLabel: 'Add Photo',
      },
      {
        id: 'bio',
        label: 'Professional Bio',
        hint: 'Add a bio about your coaching background',
        weight: 20,
        completed: bioComplete,
        actionId: 'edit-profile',
        actionLabel: 'Add Bio',
      },
      {
        id: 'journey',
        label: 'Experience / Journey',
        hint: 'Add at least one experience entry',
        weight: 20,
        completed: journeyComplete,
        actionId: 'journey-tab',
        actionLabel: 'Add Experience',
      },
      {
        id: 'gallery',
        label: 'Media Gallery',
        hint: 'Upload at least one gallery photo',
        weight: 15,
        completed: galleryComplete,
        actionId: 'gallery-tab',
        actionLabel: 'Add Media',
      },
    ]
  }, [isBasicInfoComplete, hasProfilePhoto, hasProfessionalBio, journeyCount, galleryCount])

  // Calculate total percentage
  const percentage = useMemo(() => {
    return buckets.reduce((acc, b) => acc + (b.completed ? b.weight : 0), 0)
  }, [buckets])

  return {
    /** Overall completion percentage (0-100) */
    percentage,
    /** Individual bucket states */
    buckets,
    /** True while fetching journey/gallery counts */
    loading,
    /** Re-fetch counts (call after updates) */
    refresh: fetchCounts,
  }
}
