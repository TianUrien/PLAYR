import { useEffect } from 'react'
import { X, MapPin, Calendar, Clock, Home, Car, Globe as GlobeIcon, Plane, Utensils, Briefcase, Shield, GraduationCap, Mail, Phone, CheckCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Vacancy } from '../lib/supabase'
import { Avatar } from './index'
import Button from './Button'

interface VacancyDetailViewProps {
  vacancy: Vacancy
  clubName: string
  clubLogo?: string | null
  clubId: string
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
  onClose,
  onApply,
  hasApplied = false,
  hideClubProfileButton = false
}: VacancyDetailViewProps) {
  const navigate = useNavigate()

  const handleClubClick = () => {
    onClose()
    navigate(`/clubs/id/${clubId}`)
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

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      <div className="min-h-screen px-4 py-8 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full relative">
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 min-w-[44px] min-h-[44px] hover:bg-gray-100 rounded-full transition-colors z-10 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* Header Section */}
            <div className="flex items-start gap-4 mb-6">
              <button
                onClick={handleClubClick}
                className="hover:opacity-80 transition-opacity"
                aria-label={`View ${clubName} profile`}
              >
                <Avatar
                  src={clubLogo}
                  alt={clubName}
                  size="lg"
                />
              </button>

              <div className="flex-1">
                <button
                  onClick={handleClubClick}
                  className="text-sm text-gray-600 hover:text-gray-900 mb-1 block"
                >
                  {clubName}
                </button>
                <h1 className="text-3xl font-bold text-gray-900 mb-3">
                  {vacancy.title}
                </h1>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium ${
                    vacancy.opportunity_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {vacancy.opportunity_type === 'player' ? '👤 Player' : '🎓 Coach'}
                  </span>
                  {vacancy.opportunity_type === 'player' && vacancy.gender && (
                    <span
                      className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium ${
                        vacancy.gender === 'Men' ? 'bg-blue-50 text-blue-700' : 'bg-pink-100 text-pink-700'
                      }`}
                    >
                      <span className="leading-none">{formatGender(vacancy.gender)}</span>
                    </span>
                  )}
                  {vacancy.opportunity_type === 'player' && vacancy.position && (
                    <span className="inline-flex h-9 items-center rounded-full px-3 text-sm font-medium capitalize bg-gray-100 text-gray-700">
                      {vacancy.position}
                    </span>
                  )}
                  {vacancy.priority && (
                    <span className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium ${getPriorityColor(vacancy.priority)}`}>
                      {vacancy.priority === 'high' ? <span className="mr-1">🔥</span> : null} {getPriorityLabel(vacancy.priority)}
                    </span>
                  )}
                  {hasApplied && (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium bg-green-100 text-green-700">
                      <CheckCircle className="w-4 h-4" />
                      <span className="leading-none">Applied</span>
                    </span>
                  )}
                </div>

                {/* Location & Timeline */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    <span>{vacancy.location_city}, {vacancy.location_country}</span>
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
                        className="flex items-center gap-2 px-4 py-3 bg-green-50 text-green-700 rounded-lg border border-green-200"
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
                      <span className="text-green-600 mt-1">✓</span>
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
                      <span className="text-purple-600 mt-1">•</span>
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
                        className="hover:text-purple-600 transition-colors"
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
                        className="hover:text-purple-600 transition-colors"
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
                  className="flex-1 bg-gray-100 text-gray-500 cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Application Submitted
                </Button>
              ) : onApply ? (
                <Button
                  onClick={onApply}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90"
                >
                  Apply for This Position
                </Button>
              ) : (
                <Button
                  onClick={onClose}
                  className="flex-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90"
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
                  View Club Profile
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
