import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
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
 * Requires: nationality, base_location, and at least one position.
 */
function isBasicInfoComplete(profile: Profile): boolean {
  const hasNationality = Boolean(profile.nationality?.trim())
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
 * The strength is calculated from 5 weighted buckets:
 * - Basic Info (25%): nationality, base_location, position
 * - Profile Photo (20%): avatar_url
 * - Highlight Video (25%): highlight_video_url
 * - Journey (15%): at least one playing_history entry
 * - Media Gallery (15%): at least one gallery_photos entry
 */
export function useProfileStrength(profile: Profile | null): ProfileStrengthResult {
  const [loading, setLoading] = useState(true)
  const [journeyCount, setJourneyCount] = useState<number>(0)
  const [galleryCount, setGalleryCount] = useState<number>(0)

  const fetchCounts = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // Fetch journey entries count
      const { count: journeyCountResult, error: journeyError } = await supabase
        .from('playing_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)

      if (journeyError) {
        console.error('Error fetching journey count:', journeyError)
      } else {
        setJourneyCount(journeyCountResult ?? 0)
      }

      // Fetch gallery photos count
      const { count: galleryCountResult, error: galleryError } = await supabase
        .from('gallery_photos')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)

      if (galleryError) {
        console.error('Error fetching gallery count:', galleryError)
      } else {
        setGalleryCount(galleryCountResult ?? 0)
      }
    } catch (error) {
      console.error('Error fetching profile strength data:', error)
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
        weight: 25,
        completed: isBasicInfoComplete(profile),
        action: { type: 'edit-profile' },
      },
      {
        id: 'profile-photo',
        label: 'Add a profile photo',
        description: 'Help clubs recognize you with a profile picture',
        weight: 20,
        completed: hasProfilePhoto(profile),
        action: { type: 'edit-profile' },
      },
      {
        id: 'highlight-video',
        label: 'Add your highlight video',
        description: 'Show clubs what you can do on the pitch',
        weight: 25,
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
        weight: 15,
        completed: galleryCount > 0,
        action: { type: 'tab', tab: 'profile' },
      },
    ]
  }, [profile, journeyCount, galleryCount])

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
