import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import PlayerDashboard, { type PlayerProfileShape } from './PlayerDashboard'
import CoachDashboard from './CoachDashboard'
import { useAuthStore } from '../lib/auth'

type PublicProfileBase = Pick<
  Profile,
  | 'id'
  | 'role'
  | 'username'
  | 'full_name'
  | 'avatar_url'
  | 'base_location'
  | 'bio'
  | 'highlight_video_url'
  | 'nationality'
  | 'nationality_country_id'
  | 'nationality2_country_id'
  | 'current_club'
  | 'gender'
  | 'date_of_birth'
  | 'position'
  | 'secondary_position'
  | 'email'
  | 'contact_email'
  | 'contact_email_public'
  | 'passport_1'
  | 'passport_2'
  | 'passport1_country_id'
  | 'passport2_country_id'
> & { is_test_account?: boolean }

type PublicPlayerProfileShape = PublicProfileBase & { role: 'player' }
type PublicCoachProfileShape = PublicProfileBase & { role: 'coach' }

type PublicProfile = PublicPlayerProfileShape | PublicCoachProfileShape

const PUBLIC_PROFILE_FIELDS = [
  'id',
  'role',
  'username',
  'full_name',
  'avatar_url',
  'base_location',
  'bio',
  'highlight_video_url',
  'nationality',
  'nationality_country_id',
  'nationality2_country_id',
  'current_club',
  'gender',
  'date_of_birth',
  'position',
  'secondary_position',
  'email',
  'contact_email',
  'contact_email_public',
  'passport_1',
  'passport_2',
  'passport1_country_id',
  'passport2_country_id',
  'social_links',
  'is_test_account'
].join(',')

export default function PublicPlayerProfile() {
  const { username, id } = useParams<{ username?: string; id?: string }>()
  const navigate = useNavigate()
  const { profile: currentUserProfile } = useAuthStore()
  const isCurrentUserTestAccount = currentUserProfile?.is_test_account ?? false
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Fetch by username (preferred) or fallback to ID
        if (username) {
          const { data, error: fetchError } = await supabase
            .from('profiles')
            .select(PUBLIC_PROFILE_FIELDS)
            .in('role', ['player', 'coach']) // Support both players and coaches
            .eq('username', username)
            .returns<PublicProfile>()
            .single()

          if (fetchError) {
            if (fetchError.code === 'PGRST116') {
              setError('Profile not found.')
            } else {
              throw fetchError
            }
            return
          }

          // Check if this is a test profile and current user is not a test account
          if (data.is_test_account && !isCurrentUserTestAccount) {
            setError('Profile not found.')
            return
          }

          setProfile(data)
        } else if (id) {
          const { data, error: fetchError } = await supabase
            .from('profiles')
            .select(PUBLIC_PROFILE_FIELDS)
            .in('role', ['player', 'coach']) // Support both players and coaches
            .eq('id', id)
            .returns<PublicProfile>()
            .single()

          if (fetchError) {
            if (fetchError.code === 'PGRST116') {
              setError('Profile not found.')
            } else {
              throw fetchError
            }
            return
          }

          // Check if this is a test profile and current user is not a test account
          if (data.is_test_account && !isCurrentUserTestAccount) {
            setError('Profile not found.')
            return
          }

          setProfile(data)
        } else {
          setError('Invalid profile URL')
          return
        }
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError('Failed to load profile. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [username, id, isCurrentUserTestAccount])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">🏑</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || 'Profile not found.'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // Render CoachDashboard for coaches, PlayerDashboard for players
  // Check if the current user is viewing their own profile
  const isOwnProfile = currentUserProfile?.id === profile.id

  if (profile.role === 'coach') {
    return <CoachDashboard profileData={{ ...profile, email: profile.email ?? '', contact_email_public: profile.contact_email_public ?? false }} readOnly={true} isOwnProfile={isOwnProfile} />
  }

  const playerProfileData: PlayerProfileShape = {
    ...profile,
    email: profile.email ?? '',
    contact_email_public: profile.contact_email_public ?? false,
  }

  return <PlayerDashboard profileData={playerProfileData} readOnly={true} isOwnProfile={isOwnProfile} />
}
