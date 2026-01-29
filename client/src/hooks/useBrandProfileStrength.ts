import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { BrandDetail } from './useBrand'

export interface ProfileStrengthBucket {
  id: string
  label: string
  /** Description shown when incomplete */
  hint: string
  /** Weight out of 100 */
  weight: number
  /** True when this bucket is fully completed */
  completed: boolean
  /** Optional action id the parent can handle (e.g. "edit-profile") */
  actionId?: string
  /** Label for the CTA button */
  actionLabel?: string
}

interface UseBrandProfileStrengthOptions {
  brand: BrandDetail | null
}

/**
 * Brand-specific profile strength calculation.
 *
 * Buckets:
 * - Brand Identity (30%): name, logo_url, category
 * - About (25%): bio field filled (min 50 chars)
 * - Contact Info (25%): website_url OR instagram_url
 * - Location (20%): country in profile
 */
export function useBrandProfileStrength({ brand }: UseBrandProfileStrengthOptions) {
  const [loading, setLoading] = useState(true)
  const [profileCountry, setProfileCountry] = useState<string | null>(null)

  const brandId = brand?.id ?? null
  const profileId = brand?.profile_id ?? null

  // Fetch profile country for the brand owner
  const fetchProfileData = useCallback(async () => {
    if (!profileId) {
      setProfileCountry(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('nationality, nationality_country_id')
        .eq('id', profileId)
        .single()

      setProfileCountry(data?.nationality_country_id || data?.nationality || null)
    } finally {
      setLoading(false)
    }
  }, [profileId])

  useEffect(() => {
    void fetchProfileData()
  }, [fetchProfileData])

  // Check brand identity (name, logo, category)
  const isBrandIdentityComplete = useCallback(() => {
    if (!brand) return false
    const hasName = Boolean(brand.name?.trim())
    const hasLogo = Boolean(brand.logo_url?.trim())
    const hasCategory = Boolean(brand.category?.trim())
    return hasName && hasLogo && hasCategory
  }, [brand])

  // Check about/bio (min 50 chars)
  const hasAbout = useCallback(() => {
    if (!brand) return false
    return Boolean(brand.bio?.trim() && brand.bio.trim().length >= 50)
  }, [brand])

  // Check contact info (website or instagram)
  const hasContactInfo = useCallback(() => {
    if (!brand) return false
    return Boolean(brand.website_url?.trim() || brand.instagram_url?.trim())
  }, [brand])

  // Check location
  const hasLocation = useCallback(() => {
    return Boolean(profileCountry)
  }, [profileCountry])

  // Build buckets
  const buckets: ProfileStrengthBucket[] = useMemo(() => {
    const identityComplete = isBrandIdentityComplete()
    const aboutComplete = hasAbout()
    const contactComplete = hasContactInfo()
    const locationComplete = hasLocation()

    return [
      {
        id: 'identity',
        label: 'Brand Identity',
        hint: 'Add your brand name, logo, and category',
        weight: 30,
        completed: identityComplete,
        actionId: 'edit-profile',
        actionLabel: 'Edit Brand',
      },
      {
        id: 'about',
        label: 'About Your Brand',
        hint: 'Write a description about your brand (min 50 characters)',
        weight: 25,
        completed: aboutComplete,
        actionId: 'edit-profile',
        actionLabel: 'Add Description',
      },
      {
        id: 'contact',
        label: 'Contact Info',
        hint: 'Add your website or Instagram link',
        weight: 25,
        completed: contactComplete,
        actionId: 'edit-profile',
        actionLabel: 'Add Contact',
      },
      {
        id: 'location',
        label: 'Location',
        hint: 'Add your country in profile settings',
        weight: 20,
        completed: locationComplete,
        actionId: 'edit-profile',
        actionLabel: 'Add Location',
      },
    ]
  }, [isBrandIdentityComplete, hasAbout, hasContactInfo, hasLocation])

  // Calculate total percentage
  const percentage = useMemo(() => {
    return buckets.reduce((acc, b) => acc + (b.completed ? b.weight : 0), 0)
  }, [buckets])

  return {
    /** Overall completion percentage (0-100) */
    percentage,
    /** Individual bucket states */
    buckets,
    /** True while fetching data */
    loading,
    /** Re-fetch data (call after updates) */
    refresh: fetchProfileData,
  }
}
