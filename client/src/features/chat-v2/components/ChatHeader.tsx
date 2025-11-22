import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Avatar from '@/components/Avatar'
import RoleBadge from '@/components/RoleBadge'
import type { ConversationParticipant } from '@/types/chat'
import { cn } from '@/lib/utils'

interface ChatHeaderProps {
  participant?: ConversationParticipant
  onBack: () => void
  profilePath: string | null
  isMobile: boolean
  immersiveMobile?: boolean
}

const fallbackName = 'PLAYR Member'

export function ChatHeader({ participant, onBack, profilePath, isMobile, immersiveMobile = false }: ChatHeaderProps) {
  const participantName = participant?.full_name || participant?.username || fallbackName
  const initials = participant?.full_name?.charAt(0).toUpperCase() || 'P'
  const paddingClass = isMobile
    ? immersiveMobile
      ? 'pt-[calc(var(--chat-safe-area-top,0px)+0.75rem)] pb-3'
      : 'py-3'
    : 'py-4'
  const layoutClass = isMobile ? 'px-4' : 'px-4 md:px-6'

  const headerContents = (
    <>
      <div className="min-w-0 flex-1">
        {profilePath ? (
          <Link
            to={profilePath}
            className="block truncate text-lg font-semibold text-gray-900 transition hover:text-purple-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 md:text-xl"
          >
            {participantName}
          </Link>
        ) : (
          <h2 className="truncate text-lg font-semibold text-gray-900 md:text-xl">{participantName}</h2>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <RoleBadge role={participant?.role ?? 'member'} className="md:text-sm" />
        </div>
      </div>
    </>
  )

  const headerPositionClass = isMobile && immersiveMobile
    ? 'chat-fixed-header fixed top-0 left-0 right-0 z-50'
    : 'relative'

  return (
    <header
      className={cn(
        headerPositionClass,
        'flex min-h-[4.5rem] flex-shrink-0 items-center gap-3 border-b border-gray-100 bg-white/95 text-left backdrop-blur shadow-[0_1px_0_rgba(15,23,42,0.05)]',
        paddingClass,
        layoutClass
      )}
    >
      {isMobile && (
        <button
          onClick={onBack}
          className="rounded-full p-2 transition-colors hover:bg-gray-100"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="h-5 w-5 text-gray-900" />
        </button>
      )}
      {profilePath ? (
        <Link
          to={profilePath}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
          aria-label={`View ${participantName} profile`}
        >
          <Avatar
            src={participant?.avatar_url || undefined}
            alt={participantName}
            initials={initials}
            className="h-12 w-12 text-lg shadow-lg"
            enablePreview={false}
          />
        </Link>
      ) : (
        <Avatar
          src={participant?.avatar_url || undefined}
          alt={participantName}
          initials={initials}
          className="h-12 w-12 text-lg shadow-lg"
          enablePreview={false}
        />
      )}
      {headerContents}
    </header>
  )
}
