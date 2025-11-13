import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, User } from 'lucide-react'
import { Avatar } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/lib/toast'
import { formatDistanceToNow } from 'date-fns'

interface MemberCardProps {
  id: string
  avatar_url: string | null
  full_name: string
  role: 'player' | 'coach' | 'club'
  nationality: string | null
  base_location: string | null
  position: string | null
  secondary_position: string | null
  current_team: string | null
  created_at: string
}

export default function MemberCard({
  id,
  avatar_url,
  full_name,
  role,
  nationality,
  base_location,
  position,
  secondary_position,
  current_team,
  created_at,
}: MemberCardProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const [isLoading, setIsLoading] = useState(false)
  const positions = [position, secondary_position].filter((value, index, self): value is string => {
    if (!value) return false
    return self.findIndex((item) => item === value) === index
  })

  // Title case formatter
  const toTitleCase = (str: string | null) => {
    if (!str) return ''
    return str
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  // Handle Message button
  const handleMessage = async () => {
    if (!user) {
      addToast('Please sign in to start a conversation.', 'info')
      navigate('/')
      return
    }

    setIsLoading(true)
    try {
      // Check if conversation already exists
      // Use maybeSingle() instead of single() to handle 0 or 1 results gracefully
      const { data: existingConversation, error: fetchError } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_one_id.eq.${user.id},participant_two_id.eq.${id}),and(participant_one_id.eq.${id},participant_two_id.eq.${user.id})`
        )
        .maybeSingle()

      // If there's a database error (not just "no results"), throw it
      if (fetchError) throw fetchError

      if (existingConversation) {
        // Conversation exists - navigate to it
        navigate(`/messages?conversation=${existingConversation.id}`)
      } else {
        // No conversation yet - open messages in "new conversation" mode
        navigate(`/messages?new=${id}`)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
      addToast('Failed to start conversation. Please try again.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle View Profile
  const handleViewProfile = () => {
    // Navigate to correct public profile based on role
    if (role === 'club') {
      navigate(`/clubs/id/${id}`)
    } else {
      // Players and Coaches use player profile route
      navigate(`/players/id/${id}`)
    }
  }

  // Format join date
  const joinedText = formatDistanceToNow(new Date(created_at), { addSuffix: true })

  // Role badge styles
  const roleBadgeStyles = {
    player: 'bg-blue-100 text-blue-700',
    coach: 'bg-purple-100 text-purple-700',
    club: 'bg-orange-100 text-orange-700',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow">
      {/* Avatar with lazy loading */}
      <div className="flex items-center gap-4 mb-4">
        <Avatar
          src={avatar_url}
          initials={full_name ? full_name.split(' ').map(n => n[0]).join('') : '?'}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{full_name}</h3>
          <span
            className={`inline-block px-2 py-1 rounded-full text-xs font-medium capitalize ${
              roleBadgeStyles[role]
            }`}
          >
            {role}
          </span>
        </div>
      </div>

      {/* Details - Hide empty fields */}
      <div className="space-y-2 mb-4 text-sm text-gray-600">
        {nationality && (
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-500">Nationality:</span>
            <span>{nationality}</span>
          </div>
        )}

        {base_location && (
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-500">Location base:</span>
            <span>{base_location}</span>
          </div>
        )}

        {positions.length > 0 && (role === 'player' || role === 'coach') && (
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-500">Position:</span>
            <span>{positions.map(toTitleCase).join(' • ')}</span>
          </div>
        )}

        {current_team && (
          <div className="flex items-start gap-2">
            <span className="font-medium text-gray-500">Current team:</span>
            <span>{toTitleCase(current_team)}</span>
          </div>
        )}
      </div>

      {/* Join date */}
      <p className="text-xs text-gray-400 mb-4">Joined {joinedText}</p>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleMessage}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <MessageCircle className="w-4 h-4" />
          <span>Message</span>
        </button>
        <button
          onClick={handleViewProfile}
          className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <User className="w-4 h-4" />
          <span>View</span>
        </button>
      </div>
    </div>
  )
}
