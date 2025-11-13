import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import ClubDashboard from './ClubDashboard'

export default function PublicClubProfile() {
  const { username, id } = useParams<{ username?: string; id?: string }>()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
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
            .select('*')
            .eq('role', 'club')
            .eq('username', username)
            .single()

          if (fetchError) {
            if (fetchError.code === 'PGRST116') {
              setError('Club profile not found.')
            } else {
              throw fetchError
            }
            return
          }

          setProfile(data)
        } else if (id) {
          const { data, error: fetchError } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'club')
            .eq('id', id)
            .single()

          if (fetchError) {
            if (fetchError.code === 'PGRST116') {
              setError('Club profile not found.')
            } else {
              throw fetchError
            }
            return
          }

          setProfile(data)
        } else {
          setError('Invalid profile URL')
          return
        }
      } catch (err) {
        console.error('Error fetching club profile:', err)
        setError('Failed to load club profile. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [username, id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-purple-600 mb-4"></div>
          <p className="text-gray-600">Loading club profile...</p>
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
            {error || 'This club profile could not be found.'}
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return <ClubDashboard profileData={profile} readOnly={true} />
}
