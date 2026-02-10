import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Avatar, RoleBadge } from '@/components'
import { getTimeAgo } from '@/lib/utils'
import type { ReferenceReceivedFeedItem } from '@/types/homeFeed'

interface ReferenceReceivedCardProps {
  item: ReferenceReceivedFeedItem
}

export function ReferenceReceivedCard({ item }: ReferenceReceivedCardProps) {
  const timeAgo = getTimeAgo(item.created_at, true)
  const profilePath = item.role === 'club'
    ? `/clubs/id/${item.profile_id}`
    : `/players/id/${item.profile_id}`

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="font-medium text-gray-700">New reference</span>
            <span>&middot;</span>
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Referee Info (person who gave the reference) */}
        <div className="flex items-center gap-3 mb-3">
          <Avatar
            src={item.referee_avatar}
            initials={item.referee_name?.slice(0, 2) || '?'}
            size="md"
            className="flex-shrink-0"
          />
          <div>
            <p className="font-semibold text-gray-900">{item.referee_name}</p>
            {item.referee_role && <RoleBadge role={item.referee_role} />}
          </div>
        </div>

        <p className="text-sm text-gray-500 mb-3">vouched for</p>

        {/* Profile Info (person who received the reference) */}
        <Link
          to={profilePath}
          className="flex items-center gap-3 group mb-4"
        >
          <Avatar
            src={item.avatar_url}
            initials={item.full_name?.slice(0, 2) || '?'}
            size="md"
            className="flex-shrink-0"
          />
          <div>
            <p className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
              {item.full_name}
            </p>
            {item.role && <RoleBadge role={item.role} />}
          </div>
        </Link>

        {/* Endorsement Quote */}
        {item.endorsement_text && (
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <p className="text-sm text-gray-700 italic line-clamp-3">
              "{item.endorsement_text}"
            </p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-4 flex justify-end">
          <Link
            to={profilePath}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Read full reference
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
