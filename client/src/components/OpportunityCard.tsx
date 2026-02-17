import { MapPin, Calendar, Clock, Home, Car, Globe as GlobeIcon, Plane, Utensils, Briefcase, Shield, GraduationCap, AlertTriangle } from 'lucide-react'
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
  publisherRole?: string | null
  publisherOrganization?: string | null
  leagueDivision?: string | null
  lastSeenAt?: string | null
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

const BENEFIT_COLORS: Record<string, string> = {
  housing: 'bg-blue-50 text-blue-700 border-blue-100',
  visa: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  flights: 'bg-purple-50 text-purple-700 border-purple-100',
  car: 'bg-amber-50 text-amber-700 border-amber-100',
  meals: 'bg-orange-50 text-orange-700 border-orange-100',
  job: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  insurance: 'bg-rose-50 text-rose-700 border-rose-100',
  education: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  bonuses: 'bg-green-50 text-green-700 border-green-100',
  equipment: 'bg-gray-50 text-gray-700 border-gray-100',
}

function getDeadlineLabel(deadline: string | null | undefined): { text: string; urgent: boolean } | null {
  if (!deadline) return null
  const now = new Date()
  const dl = new Date(deadline)
  const daysLeft = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (daysLeft < 0) return null
  if (daysLeft === 0) return { text: 'Closes today', urgent: true }
  if (daysLeft === 1) return { text: 'Closes tomorrow', urgent: true }
  if (daysLeft <= 7) return { text: `${daysLeft} days left`, urgent: true }
  if (daysLeft <= 14) return { text: `${daysLeft} days left`, urgent: false }
  return null
}

export default function VacancyCard({
  vacancy,
  clubName,
  clubLogo,
  clubId,
  publisherRole,
  publisherOrganization,
  leagueDivision,
  lastSeenAt,
  onViewDetails,
  onApply,
  hasApplied = false
}: VacancyCardProps) {
  const navigate = useNavigate()

  const handleApplyClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onApply) return
    onApply()
  }

  const handleClubClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigate(publisherRole === 'coach' ? `/players/id/${clubId}` : `/clubs/id/${clubId}`)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const isImmediate = !vacancy.start_date || vacancy.start_date === null

  const visibleBenefits = vacancy.benefits?.slice(0, 4) || []
  const additionalBenefitsCount = Math.max(0, (vacancy.benefits?.length || 0) - 4)

  // Get country color for banner
  const countryColor = getCountryColor(vacancy.location_country)
  const countryBannerText = formatCountryBanner(vacancy.location_country)

  // Build compound badge text: "Player · Men" or "Coach"
  const badgeParts: string[] = []
  badgeParts.push(vacancy.opportunity_type === 'player' ? 'Player' : 'Coach')
  if (vacancy.opportunity_type === 'player' && vacancy.gender) {
    badgeParts.push(vacancy.gender === 'Men' ? "Men's" : "Women's")
  }
  if (vacancy.position) {
    badgeParts.push(vacancy.position.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  }
  const roleBadgeStyle = vacancy.opportunity_type === 'player'
    ? 'bg-[#EFF6FF] text-[#2563EB]'
    : 'bg-[#F0FDFA] text-[#0D9488]'

  // NEW badge: show if opportunity was created after user's last_seen_at
  const isNew = lastSeenAt && vacancy.created_at
    ? new Date(vacancy.created_at) > new Date(lastSeenAt)
    : false

  // Deadline countdown
  const deadlineLabel = getDeadlineLabel(vacancy.application_deadline)

  // Build identity context line
  let identityContext = ''
  if (publisherRole === 'coach') {
    identityContext = publisherOrganization ? `Coach at ${publisherOrganization}` : 'Coach'
    if (leagueDivision) identityContext += ` · ${leagueDivision}`
  } else {
    identityContext = 'Club'
    if (leagueDivision) identityContext += ` · ${leagueDivision}`
  }

  return (
    <div
      onClick={onViewDetails}
      className="bg-white border border-gray-200 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group"
    >
      {/* 1. Country Banner */}
      {countryBannerText && (
        <div
          className="w-full py-1.5 px-4 text-center text-xs font-semibold tracking-wide"
          style={{ backgroundColor: countryColor.bg, color: countryColor.text }}
        >
          {countryBannerText}
        </div>
      )}

      {/* Card Content */}
      <div className="p-5">
        {/* 2. Identity row — larger avatar, bold name, league context */}
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={handleClubClick}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0"
          >
            <Avatar
              src={clubLogo}
              initials={clubName.split(' ').map(n => n[0]).join('')}
              size="md"
            />
            <div className="min-w-0 text-left">
              <span className="text-sm font-semibold text-gray-900 truncate block hover:text-[#8026FA] transition-colors">
                {clubName}
              </span>
              <span className="text-xs text-gray-500 truncate block">
                {identityContext}
              </span>
            </div>
          </button>
          {/* NEW badge or timestamp */}
          {isNew ? (
            <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-[#8026FA] text-white flex-shrink-0">
              NEW
            </span>
          ) : (
            <span className="ml-auto text-[11px] text-gray-400 flex-shrink-0">
              {getTimeAgo(vacancy.created_at || new Date().toISOString())}
            </span>
          )}
        </div>

        {/* 3. Title */}
        <h2 className="text-base font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-[#8026FA] transition-colors">
          {vacancy.title}
        </h2>

        {/* 4. Compound badge + Priority */}
        <div className="flex items-center flex-wrap gap-1.5 mb-3">
          <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${roleBadgeStyle}`}>
            {badgeParts.join(' · ')}
          </span>
          {vacancy.priority === 'high' && (
            <span className="inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium bg-red-50 text-red-600">
              <AlertTriangle className="w-3 h-3" />
              Urgent
            </span>
          )}
        </div>

        {/* 5. Key metadata row */}
        <div className={`flex items-center flex-wrap gap-x-3 gap-y-1 text-[13px] text-gray-500 ${deadlineLabel ? 'mb-2' : 'mb-3'}`}>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{vacancy.location_city}</span>
          </div>
          <span className="text-gray-300">·</span>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>{isImmediate ? 'Immediate' : formatDate(vacancy.start_date)}</span>
          </div>
          {vacancy.duration_text && (
            <>
              <span className="text-gray-300">·</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{vacancy.duration_text}</span>
              </div>
            </>
          )}
        </div>

        {/* 5b. Deadline countdown */}
        {deadlineLabel && (
          <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mb-3 ${
            deadlineLabel.urgent
              ? 'bg-red-50 text-red-600'
              : 'bg-amber-50 text-amber-700'
          }`}>
            <Clock className="w-3 h-3" />
            {deadlineLabel.text}
          </div>
        )}

        {/* 6. Description Snippet */}
        {vacancy.description && (
          <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
            {vacancy.description}
          </p>
        )}

        {/* 7. Benefits (colored pills) */}
        {vacancy.benefits && vacancy.benefits.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {visibleBenefits.map((benefit) => {
              const Icon = BENEFIT_ICONS[benefit.toLowerCase()]
              const colorClass = BENEFIT_COLORS[benefit.toLowerCase()] || 'bg-gray-50 text-gray-700 border-gray-100'
              return (
                <span
                  key={benefit}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${colorClass}`}
                >
                  {Icon && <Icon className="w-3.5 h-3.5" />}
                  {benefit.charAt(0).toUpperCase() + benefit.slice(1)}
                </span>
              )
            })}
            {additionalBenefitsCount > 0 && (
              <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium border bg-gray-50 text-gray-500 border-gray-100">
                +{additionalBenefitsCount} more
              </span>
            )}
          </div>
        )}

        {/* 8. Action */}
        <div onClick={(e) => e.stopPropagation()}>
          {hasApplied ? (
            <div className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-sm min-h-[44px] border border-[#8026FA]/15 bg-[#8026FA]/5 text-[#8026FA]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Applied
            </div>
          ) : onApply ? (
            <Button
              onClick={handleApplyClick}
              className="w-full bg-gradient-to-r from-[#8026FA] to-[#924CEC] hover:opacity-90"
            >
              Apply Now
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
