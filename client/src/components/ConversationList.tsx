import { formatDistanceToNow } from 'date-fns'
import { SUPABASE_URL } from '@/lib/supabase'

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

  const getAvatarUrl = (avatarUrl: string | null) => {
    if (!avatarUrl) return null
    if (avatarUrl.startsWith('http')) return avatarUrl
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${avatarUrl}`
  }

  const truncateMessage = (message: string, maxLength: number = 50) => {
    if (message.length <= maxLength) return message
    return message.substring(0, maxLength) + '...'
  }

  return (
    <div className="divide-y divide-gray-100">
      {conversations.map((conversation) => {
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

        return (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation.id)}
            className={buttonClasses}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={conversation.otherParticipant?.full_name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-semibold text-lg">
                  {conversation.otherParticipant?.full_name?.charAt(0).toUpperCase()}
                </div>
              )}
              {/* Online indicator - placeholder for future feature */}
              {/* <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div> */}
            </div>

            {/* Conversation Info */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <h3
                    className={`font-semibold text-gray-900 truncate ${isUnread ? 'font-bold' : ''} ${
                      isCompact ? 'text-sm' : ''
                    }`}
                  >
                    {conversation.otherParticipant?.full_name}
                  </h3>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    conversation.otherParticipant?.role === 'club'
                      ? 'bg-orange-50 text-orange-700'
                      : conversation.otherParticipant?.role === 'coach'
                      ? 'bg-purple-50 text-purple-700'
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {conversation.otherParticipant?.role === 'club' 
                      ? 'Club' 
                      : conversation.otherParticipant?.role === 'coach'
                      ? 'Coach'
                      : 'Player'}
                  </span>
                </div>
                {conversation.last_message_at && (
                  <span className="text-xs text-gray-500 flex-shrink-0">
                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                  </span>
                )}
              </div>

              {/* Last Message Preview */}
              {conversation.lastMessage && (
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${isUnread ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                    {isSentByMe && <span className="text-gray-500">You: </span>}
                    {truncateMessage(conversation.lastMessage.content)}
                  </p>
                  {isUnread && (
                    <span className="ml-2 w-2 h-2 bg-purple-600 rounded-full flex-shrink-0"></span>
                  )}
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
