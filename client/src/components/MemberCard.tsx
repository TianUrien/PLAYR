import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, User } from 'lucide-react'
import { Avatar, RoleBadge, NationalityCardDisplay, AvailabilityPill } from '@/components'
import SignInPromptModal from '@/components/SignInPromptModal'
import { useAuthStore } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { useToastStore } from '@/lib/toast'
import { formatDistanceToNow } from 'date-fns'

interface MemberCardProps {
  id: string
  avatar_url: string | null
  full_name: string
  role: 'player' | 'coach' | 'club' | 'brand'
  brandSlug?: string
  brandCategory?: string
  nationality: string | null
  nationality_country_id?: number | null
  nationality2_country_id?: number | null
  base_location: string | null
  position: string | null
  secondary_position: string | null
  current_team: string | null
  created_at: string
  open_to_play?: boolean
  open_to_coach?: boolean
}

export default function MemberCard({
  id,
  avatar_url,
  full_name,
  role,
  brandSlug,
  brandCategory,
  nationality,
  nationality_country_id,
  nationality2_country_id,
  base_location,
  position,
  secondary_position,
  current_team,
  created_at,
  open_to_play,
  open_to_coach,
}: MemberCardProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const [isLoading, setIsLoading] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const [signInAction, setSignInAction] = useState<'message' | 'view'>('message')
  const positions = [position, secondary_position].filter((value, index, self): value is string => {
    if (!value) return false
    return self.findIndex((item) => item === value) === index
  })

  // Capitalize first letter only (preserves rest of user input)
  const capitalizeFirst = (str: string | null) => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  // Handle Message button
  const handleMessage = async () => {
    if (!user) {
      setSignInAction('message')
      setShowSignInPrompt(true)
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
      logger.error('Error creating conversation:', error)
      addToast('Failed to start conversation. Please try again.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  // Handle View Profile
  const handleViewProfile = () => {
    if (!user) {
      setSignInAction('view')
      setShowSignInPrompt(true)
      return
    }
    // Navigate to correct public profile based on role
    if (role === 'brand') {
      navigate(brandSlug ? `/brands/${brandSlug}?ref=community` : '/brands')
    } else if (role === 'club') {
      navigate(`/clubs/id/${id}?ref=community`)
    } else {
      // Players and Coaches use player profile route
      navigate(`/players/id/${id}?ref=community`)
    }
  }

  // Format join date
  const joinedText = formatDistanceToNow(new Date(created_at), { addSuffix: true })

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 hover:shadow-lg transition-shadow">
      {/* Avatar with lazy loading */}
      <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
        <Avatar
          src={avatar_url}
          alt={full_name}
          initials={full_name ? full_name.split(' ').map(n => n[0]).join('') : '?'}
          size="lg"
          enablePreview
          previewTitle={full_name}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{full_name}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <RoleBadge role={role} />
            {role === 'brand' && brandCategory && (
              <span className="text-xs text-gray-500 capitalize">{brandCategory}</span>
            )}
            {role === 'player' && open_to_play && <AvailabilityPill variant="play" size="sm" />}
            {role === 'coach' && open_to_coach && <AvailabilityPill variant="coach" size="sm" />}
          </div>
        </div>
      </div>

      {/* Details - Hide empty fields */}
      <div className="space-y-2 sm:space-y-2.5 mb-3 sm:mb-4 text-sm">
        {(nationality_country_id || nationality) && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-400 min-w-[72px]">Nationality:</span>
            <NationalityCardDisplay
              primaryCountryId={nationality_country_id}
              secondaryCountryId={nationality2_country_id}
              fallbackText={nationality}
              className="text-gray-700"
            />
          </div>
        )}

        {base_location && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-400 min-w-[72px]">Location base:</span>
            <span className="text-gray-700">{base_location}</span>
          </div>
        )}

        {positions.length > 0 && (role === 'player' || role === 'coach') && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-400 min-w-[72px]">Position:</span>
            <span className="text-gray-700">{positions.map(capitalizeFirst).join(' • ')}</span>
          </div>
        )}

        {current_team && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-semibold text-gray-400 min-w-[72px]">Current team:</span>
            <span className="text-gray-700">{current_team}</span>
          </div>
        )}
      </div>

      {/* Join date */}
      <p className="text-xs text-gray-400 mb-3 sm:mb-4">Joined {joinedText}</p>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleMessage}
          disabled={isLoading}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-lg bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
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

      {/* Sign In Prompt Modal */}
      <SignInPromptModal
        isOpen={showSignInPrompt}
        onClose={() => setShowSignInPrompt(false)}
        title={signInAction === 'message' ? 'Sign in to message' : 'Sign in to view profile'}
        message={signInAction === 'message' 
          ? 'Sign in or create a free PLAYR account to connect with this member.'
          : 'Sign in or create a free PLAYR account to view member profiles.'
        }
      />
    </div>
  )
}
