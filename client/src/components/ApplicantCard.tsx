import { MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { OpportunityApplicationWithApplicant } from '@/lib/supabase'

interface ApplicantCardProps {
  application: OpportunityApplicationWithApplicant
}

export default function ApplicantCard({ application }: ApplicantCardProps) {
  const navigate = useNavigate()
  const { applicant } = application
  const displayName = applicant.full_name?.trim() || applicant.username?.trim() || 'Applicant'
  const positions = [applicant.position, applicant.secondary_position].filter((value, index, self): value is string => {
    if (!value) return false
    return self.findIndex((item) => item === value) === index
  })

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleViewProfile = () => {
    if (applicant.username) {
      navigate(`/players/${applicant.username}`)
    } else {
      navigate(`/players/id/${applicant.id}`)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        {/* Applicant Photo */}
        <button
          onClick={handleViewProfile}
          className="group flex-shrink-0 cursor-pointer"
        >
          {applicant.avatar_url ? (
            <img
              src={applicant.avatar_url}
              alt={displayName}
              className="h-14 w-14 rounded-full object-cover ring-2 ring-gray-200 transition-all group-hover:ring-blue-500 sm:h-16 sm:w-16"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 ring-2 ring-gray-200 transition-all group-hover:ring-blue-500 sm:h-16 sm:w-16">
              <span className="text-base font-bold text-white sm:text-lg">
                {getInitials(displayName)}
              </span>
            </div>
          )}
        </button>

        {/* Applicant Info */}
        <div className="min-w-0 flex-1">
          <button
            onClick={handleViewProfile}
            className="text-left group"
          >
            <h3 className="text-base font-semibold text-gray-900 transition-colors group-hover:text-blue-600 sm:text-lg">
              {displayName}
            </h3>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600 sm:text-sm">
            {positions.length > 0 ? <span className="font-medium">{positions.join(' • ')}</span> : null}
            {positions.length > 0 && applicant.base_location ? <span>•</span> : null}
            {applicant.base_location ? (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{applicant.base_location}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-2 text-xs text-gray-500 sm:text-sm">
            Applied {formatDate(application.applied_at)}
          </div>
        </div>

        {/* View Profile Button */}
        <button
          onClick={handleViewProfile}
          className="inline-flex w-full items-center justify-center rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 sm:w-auto sm:px-6 sm:py-2.5"
        >
          View Profile
        </button>
      </div>
    </div>
  )
}
