import { MapPin, Calendar, Clock, Eye, Home, Car, Globe as GlobeIcon, Plane, Utensils, Briefcase, Shield, GraduationCap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Vacancy } from '../lib/supabase'
import { Avatar } from './index'
import Button from './Button'
import { getCountryColor, formatCountryBanner } from '@/lib/countryColors'
import { getTimeAgo } from '@/lib/utils'

interface VacancyCardProps {
  vacancy: Vacancy
  clubName: string
  clubLogo?: string | null
  clubId: string
  onViewDetails: () => void
  onApply?: () => void
  hasApplied?: boolean
}

const BENEFIT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  housing: Home,
  car: Car,
  visa: GlobeIcon,
  flights: Plane,
  meals: Utensils,
  job: Briefcase,
  insurance: Shield,
  education: GraduationCap,
}

export default function VacancyCard({
  vacancy,
  clubName,
  clubLogo,
  clubId,
  onViewDetails,
  onApply,
  hasApplied = false
}: VacancyCardProps) {
  const navigate = useNavigate()

  const handleApplyClick = () => {
    if (!onApply) return
    onApply()
  }

  const handleClubClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(`/clubs/id/${clubId}`)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700'
      case 'medium': return 'bg-blue-100 text-blue-700'
      case 'low': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const getPriorityLabel = (priority: string) => {
    if (priority === 'high' && vacancy.start_date) {
      const startDate = new Date(vacancy.start_date)
      const now = new Date()
      const diffDays = Math.floor((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (diffDays <= 30) return 'Urgent'
    }
    return priority.charAt(0).toUpperCase() + priority.slice(1)
  }

  const isImmediate = !vacancy.start_date || vacancy.start_date === null

  const visibleBenefits = vacancy.benefits?.slice(0, 4) || []
  const additionalBenefitsCount = Math.max(0, (vacancy.benefits?.length || 0) - 4)

  // Get country color for banner
  const countryColor = getCountryColor(vacancy.location_country)
  const countryBannerText = formatCountryBanner(vacancy.location_country)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow relative group">
      {/* Country Banner */}
      {countryBannerText && (
        <div
          className="w-full py-2 px-4 text-center text-sm font-semibold tracking-wide"
          style={{ backgroundColor: countryColor.bg, color: countryColor.text }}
        >
          {countryBannerText}
        </div>
      )}

      {/* Card Content */}
      <div className="p-5 sm:p-6">
      {/* Club Header */}
      <div className="flex items-start justify-between mb-4">
        <button
          onClick={handleClubClick}
          className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer min-h-[44px]"
        >
          <Avatar
            src={clubLogo}
            initials={clubName.split(' ').map(n => n[0]).join('')}
            size="md"
          />
          <div className="text-left">
            <h3 className="font-semibold text-gray-900 hover:text-purple-600 transition-colors">
              {clubName}
            </h3>
          </div>
        </button>
      </div>

      {/* Badges */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ${
          vacancy.opportunity_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {vacancy.opportunity_type === 'player' ? 'Player' : 'Coach'}
        </span>
        {vacancy.opportunity_type === 'player' && vacancy.gender && (
          <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ${
            vacancy.gender === 'Men' ? 'bg-blue-50 text-blue-700' : 'bg-pink-50 text-pink-700'
          }`}>
            <span className="leading-none">{vacancy.gender === 'Men' ? 'Men' : 'Women'}</span>
          </span>
        )}
        {vacancy.priority === 'high' && (
          <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium ${getPriorityColor(vacancy.priority)}`}>
            <span className="mr-1">⚠️</span>
            {getPriorityLabel(vacancy.priority)}
          </span>
        )}
      </div>

      {/* Title */}
      <h2 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
        {vacancy.title}
      </h2>

      {/* Position - Only show for player opportunities */}
      {vacancy.opportunity_type === 'player' && vacancy.position && (
        <div className="mb-4">
          <span className="inline-block px-3 py-1 bg-[#2F855A] text-white rounded-lg text-sm font-medium">
            {vacancy.position.charAt(0).toUpperCase() + vacancy.position.slice(1)}
          </span>
        </div>
      )}

      {/* Location */}
      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
        <MapPin className="w-4 h-4 flex-shrink-0" />
        <span>{vacancy.location_city}</span>
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {isImmediate ? 'Immediate' : formatDate(vacancy.start_date)}
        </div>
        {vacancy.duration_text && (
          <>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {vacancy.duration_text}
            </div>
          </>
        )}
      </div>

      {/* Description Snippet */}
      {vacancy.description && (
        <p className="text-sm text-gray-600 mb-4 line-clamp-2">
          {vacancy.description}
        </p>
      )}

      {/* Benefits */}
      {vacancy.benefits && vacancy.benefits.length > 0 && (
        <div className="mb-4">
          <div className="flex flex-wrap gap-2">
            {visibleBenefits.map((benefit) => {
              const Icon = BENEFIT_ICONS[benefit.toLowerCase()]
              return (
                <span
                  key={benefit}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded text-xs"
                >
                  {Icon && <Icon className="w-3 h-3" />}
                  {benefit.charAt(0).toUpperCase() + benefit.slice(1)}
                </span>
              )
            })}
            {additionalBenefitsCount > 0 && (
              <span className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                +{additionalBenefitsCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
        {hasApplied ? (
          <button
            disabled
            className="flex-1 px-4 py-2 rounded-lg font-semibold min-h-[44px] border border-[#e3d6ff] bg-gradient-to-r from-[#ede8ff] via-[#f6edff] to-[#fbf2ff] text-[#7c3aed] shadow-[0_12px_30px_rgba(124,58,237,0.18)]"
          >
            ✓ Applied
          </button>
        ) : onApply ? (
          <Button
            onClick={handleApplyClick}
            className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90"
          >
            Apply Now
          </Button>
        ) : (
          <Button
            onClick={onViewDetails}
            className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90"
          >
            View Details
          </Button>
        )}
        <button
          onClick={onViewDetails}
          className="p-3 min-w-[44px] min-h-[44px] border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
          title="View details"
          aria-label={`View details for ${vacancy.title} position at ${clubName}`}
        >
          <Eye className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Timestamp */}
      <div className="mt-3 text-xs text-gray-500 text-right">
        {getTimeAgo(vacancy.created_at || new Date().toISOString())}
      </div>
      </div>
    </div>
  )
}
