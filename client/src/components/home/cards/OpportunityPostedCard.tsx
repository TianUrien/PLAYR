import { Link, useNavigate } from 'react-router-dom'
import { Briefcase, MapPin } from 'lucide-react'
import { Avatar } from '@/components'
import { getTimeAgo } from '@/lib/utils'
import type { OpportunityPostedFeedItem } from '@/types/homeFeed'

interface OpportunityPostedCardProps {
  item: OpportunityPostedFeedItem
}

export function OpportunityPostedCard({ item }: OpportunityPostedCardProps) {
  const navigate = useNavigate()
  const timeAgo = getTimeAgo(item.created_at, true)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-[#8026FA]/10 flex items-center justify-center flex-shrink-0">
            <Briefcase className="w-4 h-4 text-[#8026FA]" />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="font-medium text-gray-700">New Opportunity posted</span>
            <span>&middot;</span>
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Opportunity Details */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            {item.title}
          </h3>

          <div className="flex items-center gap-3 flex-wrap text-sm text-gray-600 mb-3">
            {item.position && (
              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                {item.position}
              </span>
            )}
            {item.gender && (
              <span className="px-2.5 py-1 bg-pink-50 text-pink-700 rounded-full text-xs font-medium">
                {item.gender === 'Men' ? "Men's Team" : "Women's Team"}
              </span>
            )}
            {(item.location_city || item.location_country) && (
              <span className="flex items-center gap-1 text-gray-500">
                <MapPin className="w-3.5 h-3.5" />
                {[item.location_city, item.location_country].filter(Boolean).join(', ')}
              </span>
            )}
          </div>

          {/* Club Info */}
          <Link
            to={`/clubs/id/${item.club_id}`}
            className="flex items-center gap-2.5 group"
          >
            <span className="text-sm text-gray-500">by</span>
            <Avatar
              src={item.club_logo}
              initials={item.club_name?.slice(0, 2) || '?'}
              size="sm"
              className="flex-shrink-0"
            />
            <span className="text-sm font-medium text-gray-700 group-hover:text-[#8026FA] transition-colors">
              {item.club_name}
            </span>
          </Link>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate(`/opportunities/${item.vacancy_id}`)}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          Apply Now
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>
    </div>
  )
}
