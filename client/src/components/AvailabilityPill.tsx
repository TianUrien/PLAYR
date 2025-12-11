import { Zap } from 'lucide-react'

type AvailabilityType = 'play' | 'coach'

interface AvailabilityPillProps {
  type: AvailabilityType
  className?: string
}

/**
 * AvailabilityPill - Displays availability status for players and coaches
 * 
 * Used in:
 * - Community page member cards
 * - Public profile pages
 * - Dashboard headers
 * 
 * Style:
 * - Players (Open to Play): Green gradient
 * - Coaches (Open to Coach): Purple/violet gradient
 */
export default function AvailabilityPill({ type, className = '' }: AvailabilityPillProps) {
  const isPlay = type === 'play'
  
  const gradientClass = isPlay
    ? 'bg-gradient-to-r from-emerald-400 to-green-500'
    : 'bg-gradient-to-r from-violet-500 to-purple-600'
  
  const label = isPlay ? 'Open to Play' : 'Open to Coach'

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-3 py-1
        rounded-full
        text-white text-xs font-medium
        ${gradientClass}
        shadow-sm
        ${className}
      `}
    >
      <Zap className="w-3 h-3" fill="currentColor" />
      {label}
    </span>
  )
}

/**
 * Helper component that conditionally renders the appropriate pill
 * based on role and availability flags
 */
interface ConditionalAvailabilityPillProps {
  role: 'player' | 'coach' | 'club'
  openToPlay?: boolean
  openToCoach?: boolean
  className?: string
}

export function ConditionalAvailabilityPill({
  role,
  openToPlay,
  openToCoach,
  className = '',
}: ConditionalAvailabilityPillProps) {
  // Players with open_to_play = true
  if (role === 'player' && openToPlay) {
    return <AvailabilityPill type="play" className={className} />
  }
  
  // Coaches with open_to_coach = true
  if (role === 'coach' && openToCoach) {
    return <AvailabilityPill type="coach" className={className} />
  }
  
  // Clubs or inactive availability: render nothing
  return null
}
