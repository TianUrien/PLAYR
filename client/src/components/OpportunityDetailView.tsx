import { useEffect, useState } from 'react'
import { X, MapPin, Calendar, Clock, Home, Car, Globe as GlobeIcon, Plane, Utensils, Briefcase, Shield, GraduationCap, Mail, Phone, CheckCircle, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Vacancy } from '../lib/supabase'
import { Avatar } from './index'
import Button from './Button'
import { getCountryColor, formatCountryBanner } from '@/lib/countryColors'

interface VacancyDetailViewProps {
  vacancy: Vacancy
  clubName: string
  clubLogo?: string | null
  clubId: string
  publisherRole?: string | null
  publisherOrganization?: string | null
  leagueDivision?: string | null
  onClose: () => void
  onApply?: () => void
  hasApplied?: boolean
  hideClubProfileButton?: boolean
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

export default function VacancyDetailView({
  vacancy,
  clubName,
  clubLogo,
  clubId,
  publisherRole,
  publisherOrganization,
  leagueDivision,
  onClose,
  onApply,
  hasApplied = false,
  hideClubProfileButton = false
}: VacancyDetailViewProps) {
  const navigate = useNavigate()

  const handleClubClick = () => {
    onClose()
    navigate(publisherRole === 'coach' ? `/players/id/${clubId}` : `/clubs/id/${clubId}`)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not specified'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric' 
    })
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
      const daysUntilStart = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      
      if (daysUntilStart <= 30 && daysUntilStart > 0) {
        return `Urgent - Starts in ${daysUntilStart} days`
      }
    }
    return priority.charAt(0).toUpperCase() + priority.slice(1) + ' Priority'
  }

  const formatGender = (gender: string) => {
    const genderMap: Record<string, string> = {
      'Men': "Men's",
      'Women': "Women's",
      'men': "Men's",
      'women': "Women's",
      'male': "Men's",
      'female': "Women's"
    }
    return genderMap[gender] || gender
  }

  const [isVisible, setIsVisible] = useState(false)

  // Lock body scroll and trigger enter animation
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Trigger enter animation on next frame
    requestAnimationFrame(() => setIsVisible(true))

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  // Get country color for banner
  const countryColor = getCountryColor(vacancy.location_country)
  const countryBannerText = formatCountryBanner(vacancy.location_country)

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto transition-opacity duration-200 ease-out ${isVisible ? 'bg-black/50' : 'bg-black/0'}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="min-h-screen px-4 py-8 flex items-center justify-center">
        <div
          className={`bg-white rounded-2xl shadow-2xl max-w-4xl w-full relative overflow-hidden transition-all duration-200 ease-out ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          {/* Country Banner - Context only, no buttons */}
          {countryBannerText && (
            <div
              className="w-full py-3 px-4 text-center text-sm font-semibold tracking-wide"
              style={{ backgroundColor: countryColor.bg, color: countryColor.text }}
            >
              {countryBannerText}
            </div>
          )}

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* Header Section with Close Button */}
            <div className="flex items-start gap-4 mb-4">
              <button
                onClick={handleClubClick}
                className="hover:opacity-80 transition-opacity flex-shrink-0"
                aria-label={`View ${clubName} profile`}
              >
                <Avatar
                  src={clubLogo}
                  alt={clubName}
                  size="lg"
                />
              </button>

              <div className="flex-1 min-w-0">
                {/* Club Name Row with Close Button */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      onClick={handleClubClick}
                      className="text-sm text-gray-600 hover:text-gray-900 block"
                    >
                      {clubName}
                    </button>
                    {publisherRole && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {publisherRole === 'coach'
                          ? publisherOrganization
                            ? `Coach at ${publisherOrganization}`
                            : 'Coach'
                          : 'Club'}
                        {leagueDivision ? ` · ${leagueDivision}` : ''}
                      </p>
                    )}
                  </div>
                  {/* Close Button - Subtle, inside white area */}
                  <button
                    onClick={onClose}
                    className="p-2 min-w-[36px] min-h-[36px] hover:bg-gray-100 rounded-full transition-colors flex items-center justify-center flex-shrink-0 -mt-1 -mr-2"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1 mb-3">
                  {vacancy.title}
                </h1>

                {/* Position Block */}
                {vacancy.position && (
                  <div className="mb-3 rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5 max-w-xs">
                    <span className="block text-[11px] uppercase tracking-wider text-gray-500 font-medium">Position</span>
                    <span className="block text-sm font-semibold text-gray-900 capitalize">{vacancy.position.replace(/_/g, ' ')}</span>
                  </div>
                )}

                {/* Secondary Tags Row - Role, Gender, Priority */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold bg-[#8026FA]/10 text-[#8026FA]">
                    {vacancy.opportunity_type === 'player' ? 'Player' : 'Coach'}
                    {vacancy.opportunity_type === 'player' && vacancy.gender && ` · ${formatGender(vacancy.gender)}`}
                    {vacancy.position && ` · ${vacancy.position.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`}
                  </span>
                  {vacancy.priority && vacancy.priority !== 'low' && (
                    <span className={`inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-medium ${getPriorityColor(vacancy.priority)}`}>
                      {vacancy.priority === 'high' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {getPriorityLabel(vacancy.priority)}
                    </span>
                  )}
                  {hasApplied && (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold border border-[#8026FA]/15 bg-[#8026FA]/5 text-[#8026FA]">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="leading-none">Applied</span>
                    </span>
                  )}
                </div>

                {/* Location & Timeline */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{vacancy.location_city}</span>
                  </div>
                  {vacancy.start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>Starts {formatDate(vacancy.start_date)}</span>
                    </div>
                  )}
                  {vacancy.duration_text && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>{vacancy.duration_text}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-200 my-6"></div>

            {/* Description */}
            {vacancy.description && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">About This Opportunity</h2>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {vacancy.description}
                </p>
              </div>
            )}

            {/* Benefits Section */}
            {vacancy.benefits && vacancy.benefits.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Benefits & Perks</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {vacancy.benefits.map((benefit) => {
                    const Icon = BENEFIT_ICONS[benefit.toLowerCase()]
                    return (
                      <div
                        key={benefit}
                        className="flex items-center gap-2 px-4 py-3 bg-gray-50 text-gray-700 rounded-lg border border-gray-200"
                      >
                        {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                        <span className="text-sm font-medium capitalize">{benefit}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Custom Benefits */}
            {vacancy.custom_benefits && vacancy.custom_benefits.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Additional Benefits</h2>
                <ul className="space-y-2">
                  {vacancy.custom_benefits.map((benefit, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700">
                      <span className="text-[#8026FA] mt-1">✓</span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Requirements Section */}
            {vacancy.requirements && vacancy.requirements.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Requirements</h2>
                <ul className="space-y-2">
                  {vacancy.requirements.map((requirement, index) => (
                    <li key={index} className="flex items-start gap-2 text-gray-700">
                      <span className="text-[#8026FA] mt-1">•</span>
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Application Deadline */}
            {vacancy.application_deadline && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Application Deadline</h2>
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-5 h-5 text-red-500" />
                  <span className="font-medium">{formatDate(vacancy.application_deadline)}</span>
                </div>
              </div>
            )}

            {/* Contact Information */}
            {(vacancy.contact_email || vacancy.contact_phone) && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact Information</h2>
                <div className="space-y-2">
                  {vacancy.contact_email && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Mail className="w-5 h-5 text-gray-500" />
                      <a 
                        href={`mailto:${vacancy.contact_email}`}
                        className="hover:text-[#8026FA] transition-colors"
                      >
                        {vacancy.contact_email}
                      </a>
                    </div>
                  )}
                  {vacancy.contact_phone && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Phone className="w-5 h-5 text-gray-500" />
                      <a 
                        href={`tel:${vacancy.contact_phone}`}
                        className="hover:text-[#8026FA] transition-colors"
                      >
                        {vacancy.contact_phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-200 my-6"></div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {hasApplied ? (
                <Button
                  disabled
                  className="flex-1 cursor-not-allowed bg-gradient-to-r from-[#ede8ff] via-[#f6edff] to-[#fbf2ff] text-[#7c3aed] border border-[#e3d6ff] shadow-[0_20px_40px_rgba(124,58,237,0.18)] flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Application Submitted
                </Button>
              ) : onApply ? (
                <Button
                  onClick={onApply}
                  className="flex-1 bg-gradient-to-r from-[#8026FA] to-[#924CEC] hover:opacity-90"
                >
                  Apply for This Position
                </Button>
              ) : (
                <Button
                  onClick={onClose}
                  className="flex-1 bg-gradient-to-r from-[#8026FA] to-[#924CEC] hover:opacity-90"
                >
                  Close
                </Button>
              )}
              {!hideClubProfileButton && (
                <Button
                  onClick={handleClubClick}
                  variant="outline"
                  className="sm:w-auto"
                >
                  {publisherRole === 'coach' ? 'View Profile' : 'View Club Profile'}
                </Button>
              )}
            </div>

            {/* Timestamp */}
            <div className="mt-6 text-sm text-gray-500 text-center">
              Posted on {formatDate(vacancy.created_at)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
