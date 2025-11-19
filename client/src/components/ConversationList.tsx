import { useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { useVirtualizer } from '@tanstack/react-virtual'
import { SUPABASE_URL } from '@/lib/supabase'
import Avatar from './Avatar'
import RoleBadge from './RoleBadge'

interface Conversation {
  id: string
  participant_one_id: string
  participant_two_id: string
  created_at: string
  updated_at: string
  last_message_at: string | null
  otherParticipant?: {
    id: string
    full_name: string
    username: string | null
    avatar_url: string | null
    role: 'player' | 'coach' | 'club'
  }
  lastMessage?: {
    content: string
    sent_at: string
    sender_id: string
  }
  unreadCount?: number
}

interface ConversationListProps {
  conversations: Conversation[]
  selectedConversationId: string | null
  onSelectConversation: (conversationId: string) => void
  currentUserId: string
  variant?: 'default' | 'compact'
}

export default function ConversationList({
  conversations,
  selectedConversationId,
  onSelectConversation,
  currentUserId,
  variant = 'default'
}: ConversationListProps) {
  const isCompact = variant === 'compact'
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isCompact ? 68 : 92),
    overscan: 6
  })

  const getAvatarUrl = (avatarUrl: string | null) => {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('http')) return avatarUrl
    return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`
  }

  const truncateMessage = (message: string, maxLength: number = 50) => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }

  const getInitials = (value?: string | null) => {
    if (!value) return '?'
    return value
      .trim()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]!.toUpperCase())
      .join('')
  }

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualItems.map(virtualRow => {
          const conversation = conversations[virtualRow.index]
          if (!conversation) {
            return null
          }

          const isSelected = conversation.id === selectedConversationId
          const avatarUrl = getAvatarUrl(conversation.otherParticipant?.avatar_url || null)
          const isUnread = (conversation.unreadCount || 0) > 0
          const isSentByMe = conversation.lastMessage?.sender_id === currentUserId
          const buttonClasses = `w-full flex items-start gap-3 ${isCompact ? 'px-3 py-3' : 'p-4'} transition-colors ${
            isSelected
              ? isCompact
                ? 'bg-gray-100 hover:bg-gray-100'
                : 'bg-purple-50 hover:bg-purple-50'
              : 'hover:bg-gray-50'
          }`
          const participantName =
            conversation.otherParticipant?.full_name ||
            conversation.otherParticipant?.username ||
            'PLAYR Member'
          const avatarInitials = getInitials(participantName)

          return (
            <div
              key={conversation.id}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute left-0 w-full border-b border-gray-100"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <button onClick={() => onSelectConversation(conversation.id)} className={buttonClasses}>
                <div className="relative flex-shrink-0">
                  <Avatar
                    src={avatarUrl}
                    alt={participantName}
                    initials={avatarInitials}
                    className="w-12 h-12 text-lg shadow-sm"
                    enablePreview
                    previewTitle={participantName}
                    previewInteraction="pointer"
                  />
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`truncate font-semibold text-gray-900 ${
                          isUnread ? 'font-bold' : ''
                        } ${isCompact ? 'text-sm' : ''}`}
                      >
                        {participantName}
                      </h3>
                      <RoleBadge role={conversation.otherParticipant?.role ?? 'member'} />
                    </div>
                    {conversation.last_message_at && (
                      <span className="flex-shrink-0 text-xs text-gray-500">
                        {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>

                  {conversation.lastMessage && (
                    <div className="flex items-center justify-between">
                      <p className={`text-sm truncate ${isUnread ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                        {isSentByMe && <span className="text-gray-500">You: </span>}
                        {truncateMessage(conversation.lastMessage.content)}
                      </p>
                      {isUnread && <span className="ml-2 h-2 w-2 flex-shrink-0 rounded-full bg-purple-600"></span>}
                    </div>
                  )}
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
