/** Coach specialization types and display helpers. */

export type CoachSpecialization =
  | 'head_coach'
  | 'assistant_coach'
  | 'goalkeeper_coach'
  | 'youth_coach'
  | 'strength_conditioning'
  | 'performance_analyst'
  | 'sports_scientist'
  | 'other'

export interface CoachSpecializationOption {
  value: CoachSpecialization
  label: string
  description: string
}

export const COACH_SPECIALIZATIONS: CoachSpecializationOption[] = [
  { value: 'head_coach', label: 'Head Coach', description: 'Lead coach, tactical & team management' },
  { value: 'assistant_coach', label: 'Assistant Coach', description: 'Supports head coach, session delivery' },
  { value: 'goalkeeper_coach', label: 'Goalkeeper Coach', description: 'Specialist GK training & development' },
  { value: 'youth_coach', label: 'Youth / Development Coach', description: 'Age-group coaching, talent pathway' },
  { value: 'strength_conditioning', label: 'Strength & Conditioning Coach', description: 'Physical preparation, injury prevention' },
  { value: 'performance_analyst', label: 'Performance Analyst', description: 'Video analysis, data & match statistics' },
  { value: 'sports_scientist', label: 'Sports Scientist', description: 'Physiology, load monitoring, recovery' },
  { value: 'other', label: 'Other', description: 'A different coaching or staff role' },
]

/** Returns the display label for a specialization key, or the custom title for 'other'. */
export function getSpecializationLabel(
  specialization: string | null | undefined,
  customTitle?: string | null
): string {
  if (!specialization) return 'Coach'
  if (specialization === 'other' && customTitle) return customTitle
  const option = COACH_SPECIALIZATIONS.find(s => s.value === specialization)
  return option?.label ?? 'Coach'
}
