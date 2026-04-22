import { useMemo } from 'react'
import type { UmpireProfileShape } from '@/pages/UmpireDashboard'

export interface ProfileBucket {
  id: string
  label: string
  /** Description shown when incomplete */
  hint: string
  /** Honest, conservative line describing what completing this step unlocks */
  unlockCopy: string
  /** Weight out of 100 */
  weight: number
  /** True when this bucket is fully completed */
  completed: boolean
  /** Optional action id the parent can handle (all umpire buckets open EditProfileModal today) */
  actionId?: string
  /** Label for the CTA button */
  actionLabel?: string
}

interface UseUmpireProfileStrengthOptions {
  profile: UmpireProfileShape | null
}

/**
 * Umpire-specific profile strength calculation.
 *
 * Credentials still lead (50 pts) but Phase C (officiating history) and
 * Phase E (peer references) now contribute — matches the umpire branch of
 * `estimateMemberStrength` in lib/profileTier.ts so the percentage here
 * (owner view) agrees with the tier badge shown on community cards.
 *
 * Buckets (total 100):
 * - Umpire Level (20): umpire_level
 * - Federation (15): federation
 * - Specialization (10): officiating_specialization
 * - Profile Photo (10): avatar_url
 * - Bio (10): bio
 * - Languages (10): >=1 language
 * - Years Officiating (5): umpire_since
 * - Appointments (10): >=1 umpire_appointments row
 * - References (10): >=1 accepted profile_references row
 */
export function useUmpireProfileStrength({ profile }: UseUmpireProfileStrengthOptions) {
  const buckets: ProfileBucket[] = useMemo(() => {
    const level = Boolean(profile?.umpire_level?.trim())
    const federation = Boolean(profile?.federation?.trim())
    const specialization = Boolean(profile?.officiating_specialization?.trim())
    const photo = Boolean(profile?.avatar_url?.trim())
    const bio = Boolean(profile?.bio?.trim())
    const languages = (profile?.languages?.length ?? 0) >= 1
    const years = (profile?.umpire_since ?? 0) > 0
    const appointments = (profile?.umpire_appointment_count ?? 0) >= 1
    const references = (profile?.accepted_reference_count ?? 0) >= 1

    return [
      {
        id: 'umpire-level',
        label: 'Umpire Level',
        hint: 'Add your certification level (e.g. FIH International, National).',
        unlockCopy: 'Level is the first thing clubs and fellow umpires look for.',
        weight: 20,
        completed: level,
        actionId: 'edit-profile',
        actionLabel: 'Add Level',
      },
      {
        id: 'federation',
        label: 'Federation',
        hint: 'Add the governing body you officiate under.',
        unlockCopy: 'Shows which national or international body certified you.',
        weight: 15,
        completed: federation,
        actionId: 'edit-profile',
        actionLabel: 'Add Federation',
      },
      {
        id: 'specialization',
        label: 'Specialization',
        hint: 'Pick outdoor, indoor, or both.',
        unlockCopy: 'Helps match you with the right appointments and tournaments.',
        weight: 10,
        completed: specialization,
        actionId: 'edit-profile',
        actionLabel: 'Set Specialization',
      },
      {
        id: 'photo',
        label: 'Profile Photo',
        hint: 'Upload a profile photo.',
        unlockCopy: 'Helps put a face to your name.',
        weight: 10,
        completed: photo,
        actionId: 'edit-profile',
        actionLabel: 'Add Photo',
      },
      {
        id: 'bio',
        label: 'Bio',
        hint: 'Add a short bio about your officiating background.',
        unlockCopy: 'A few lines of context beyond the badges.',
        weight: 10,
        completed: bio,
        actionId: 'edit-profile',
        actionLabel: 'Add Bio',
      },
      {
        id: 'languages',
        label: 'Languages',
        hint: 'Add at least one language you officiate in.',
        unlockCopy: 'Matters for international tournaments and mixed-language panels.',
        weight: 10,
        completed: languages,
        actionId: 'edit-profile',
        actionLabel: 'Add Languages',
      },
      {
        id: 'umpire-since',
        label: 'Years Officiating',
        hint: 'Add the year you first became certified.',
        unlockCopy: 'Experience is a fast trust signal for assigners.',
        weight: 5,
        completed: years,
        actionId: 'edit-profile',
        actionLabel: 'Add Start Year',
      },
      {
        id: 'appointments',
        label: 'Officiating History',
        hint: 'Log at least one tournament, league, or match you\u2019ve officiated.',
        unlockCopy: 'Concrete history is the strongest credibility signal beyond the badge.',
        weight: 10,
        completed: appointments,
        actionId: 'appointments',
        actionLabel: 'Add Appointment',
      },
      {
        id: 'references',
        label: 'Peer References',
        hint: 'Get at least one trusted reference from a coach, fellow umpire, or club.',
        unlockCopy: 'A peer vouching for you builds trust faster than any credential alone.',
        weight: 10,
        completed: references,
        actionId: 'references',
        actionLabel: 'Get Reference',
      },
    ]
  }, [profile])

  const percentage = useMemo(
    () => buckets.reduce((acc, b) => acc + (b.completed ? b.weight : 0), 0),
    [buckets]
  )

  return {
    /** Overall completion percentage (0-100) */
    percentage,
    /** Individual bucket states */
    buckets,
    /** Always false — all umpire buckets derive from profile fields, no secondary queries */
    loading: false,
    /** No-op — kept for interface parity with the other strength hooks */
    refresh: async () => {},
  }
}
