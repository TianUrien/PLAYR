import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type { Profile } from '@/lib/supabase'

export type ProfileStrengthBucket = {
  id: string
  label: string
  description: string
  weight: number
  completed: boolean
  /** Navigation target when clicking this item (tab name or action) */
  action: ProfileStrengthAction
}

export type ProfileStrengthAction =
  | { type: 'edit-profile' }
  | { type: 'tab'; tab: string }
  | { type: 'add-video' }

export type ProfileStrengthResult = {
  /** Overall completion percentage (0-100) */
  percentage: number
  /** Individual bucket completion status */
  buckets: ProfileStrengthBucket[]
  /** Whether the data is still loading */
  loading: boolean
  /** Refresh the profile strength calculation */
  refresh: () => Promise<void>
}

/**
 * Checks if the basic info bucket is complete for a player.
 * Requires: nationality (or nationality_country_id), base_location, and at least one position.
 */
function isBasicInfoComplete(profile: Profile): boolean {
  // Accept either new country_id field OR legacy nationality text field
  const hasNationality = Boolean(profile.nationality_country_id || profile.nationality?.trim())
  const hasLocation = Boolean(profile.base_location?.trim())
  const hasPosition = Boolean(profile.position?.trim())
  return hasNationality && hasLocation && hasPosition
}

/**
 * Checks if the profile has a photo.
 */
function hasProfilePhoto(profile: Profile): boolean {
  return Boolean(profile.avatar_url?.trim())
}

/**
 * Checks if the profile has a highlight video.
 */
function hasHighlightVideo(profile: Profile): boolean {
  return Boolean(profile.highlight_video_url?.trim())
}

/**
 * Hook to calculate profile strength/completion for Player profiles.
 *
 * The strength is calculated from 7 weighted buckets:
 * - Basic Info (15%): nationality, base_location, position
 * - Profile Photo (15%): avatar_url
 * - Highlight Video (20%): highlight_video_url
 * - Journey (15%): at least one career_history entry
 * - Media Gallery (10%): at least one gallery_photos entry
 * - Friends (10%): at least one accepted friend connection
 * - References (15%): at least one approved reference
 */
export function useProfileStrength(profile: Profile | null): ProfileStrengthResult {
  const [loading, setLoading] = useState(true)
  const [journeyCount, setJourneyCount] = useState<number>(0)
  const [galleryCount, setGalleryCount] = useState<number>(0)
  const [friendCount, setFriendCount] = useState<number>(0)
  const [referenceCount, setReferenceCount] = useState<number>(0)

  const fetchCounts = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [journeyRes, galleryRes, friendsRes, referencesRes] = await Promise.all([
        supabase
          .from('career_history')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id),
        supabase
          .from('gallery_photos')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id),
        supabase
          .from('profile_friendships')
          .select('id', { count: 'exact', head: true })
          .or(`user_one.eq.${profile.id},user_two.eq.${profile.id}`)
          .eq('status', 'accepted'),
        supabase
          .from('profile_references')
          .select('id', { count: 'exact', head: true })
          .eq('requester_id', profile.id)
          .eq('status', 'accepted'),
      ])

      if (journeyRes.error) {
        logger.error('Error fetching journey count:', journeyRes.error)
      } else {
        setJourneyCount(journeyRes.count ?? 0)
      }

      if (galleryRes.error) {
        logger.error('Error fetching gallery count:', galleryRes.error)
      } else {
        setGalleryCount(galleryRes.count ?? 0)
      }

      if (friendsRes.error) {
        logger.error('Error fetching friend count:', friendsRes.error)
      } else {
        setFriendCount(friendsRes.count ?? 0)
      }

      if (referencesRes.error) {
        logger.error('Error fetching reference count:', referencesRes.error)
      } else {
        setReferenceCount(referencesRes.count ?? 0)
      }
    } catch (error) {
      logger.error('Error fetching profile strength data:', error)
    } finally {
      setLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    void fetchCounts()
  }, [fetchCounts])

  const buckets = useMemo<ProfileStrengthBucket[]>(() => {
    if (!profile) {
      return []
    }

    return [
      {
        id: 'basic-info',
        label: 'Basic info completed',
        description: 'Add your nationality, location, and playing position',
        weight: 15,
        completed: isBasicInfoComplete(profile),
        action: { type: 'edit-profile' },
      },
      {
        id: 'profile-photo',
        label: 'Add a profile photo',
        description: 'Help clubs recognize you with a profile picture',
        weight: 15,
        completed: hasProfilePhoto(profile),
        action: { type: 'edit-profile' },
      },
      {
        id: 'highlight-video',
        label: 'Add your highlight video',
        description: 'Show clubs what you can do on the pitch',
        weight: 20,
        completed: hasHighlightVideo(profile),
        action: { type: 'add-video' },
      },
      {
        id: 'journey',
        label: 'Share a moment in your Journey',
        description: 'Add your career history, milestones, or achievements',
        weight: 15,
        completed: journeyCount > 0,
        action: { type: 'tab', tab: 'journey' },
      },
      {
        id: 'media-gallery',
        label: 'Add a photo or video to your Gallery',
        description: 'Build your visual portfolio for clubs to see',
        weight: 10,
        completed: galleryCount > 0,
        action: { type: 'tab', tab: 'profile' },
      },
      {
        id: 'friends',
        label: 'Make your first connection',
        description: 'Add a friend to start building your trusted circle',
        weight: 10,
        completed: friendCount > 0,
        action: { type: 'tab', tab: 'friends' },
      },
      {
        id: 'references',
        label: 'Get a trusted reference',
        description: 'Ask a coach or teammate to vouch for you',
        weight: 15,
        completed: referenceCount > 0,
        action: { type: 'tab', tab: 'friends' },
      },
    ]
  }, [profile, journeyCount, galleryCount, friendCount, referenceCount])

  const percentage = useMemo(() => {
    if (buckets.length === 0) return 0
    return buckets.reduce((acc, bucket) => acc + (bucket.completed ? bucket.weight : 0), 0)
  }, [buckets])

  return {
    percentage,
    buckets,
    loading,
    refresh: fetchCounts,
  }
}
