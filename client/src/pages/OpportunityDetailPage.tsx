import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/auth'
import type { Vacancy } from '../lib/supabase'
import Header from '../components/Header'
import VacancyDetailView from '../components/VacancyDetailView'
import ApplyToVacancyModal from '../components/ApplyToVacancyModal'

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [club, setClub] = useState<{ id: string; full_name: string | null; avatar_url: string | null } | null>(null)
  const [hasApplied, setHasApplied] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchVacancyDetails = useCallback(async () => {
    if (!id) return

    try {
      // Fetch vacancy
      const { data: vacancyData, error: vacancyError } = await supabase
        .from('vacancies')
        .select('*')
        .eq('id', id)
        .eq('status', 'open')
        .single()

      if (vacancyError || !vacancyData) {
        console.error('Vacancy not found:', vacancyError)
        setNotFound(true)
        return
      }

      setVacancy(vacancyData as Vacancy)

      // Fetch club details
      const { data: clubData } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .eq('id', vacancyData.club_id)
        .single()

      if (clubData) {
        setClub(clubData)
      }

      // Check if user has applied
      if (user && profile?.role === 'player') {
        const { data: applicationData } = await supabase
          .from('vacancy_applications')
          .select('id')
          .eq('vacancy_id', id)
          .eq('player_id', user.id)
          .single()

        setHasApplied(!!applicationData)
      }
    } catch (error) {
      console.error('Error fetching vacancy details:', error)
      setNotFound(true)
    } finally {
      setIsLoading(false)
    }
  }, [id, user, profile])

  useEffect(() => {
    if (!id) {
      navigate('/opportunities')
      return
    }

    fetchVacancyDetails()
  }, [id, navigate, fetchVacancyDetails])

  const refreshApplicationStatus = async () => {
    if (!id || !user || profile?.role !== 'player') return

    const { data } = await supabase
      .from('vacancy_applications')
      .select('id')
      .eq('vacancy_id', id)
      .eq('player_id', user.id)
      .single()

    setHasApplied(!!data)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)', paddingTop: '80px' }}>
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading opportunity...</p>
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !vacancy || !club) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)', paddingTop: '80px' }}>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Opportunity Not Found</h1>
            <p className="text-gray-600 mb-6">This opportunity may have been closed or removed.</p>
            <button
              onClick={() => navigate('/opportunities')}
              className="px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Browse Opportunities
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-20">
          <VacancyDetailView
            vacancy={vacancy}
            clubName={club.full_name || 'Unknown Club'}
            clubLogo={club.avatar_url}
            clubId={club.id}
            onClose={() => navigate('/opportunities')}
            onApply={
              user && (profile?.role === 'player' || profile?.role === 'coach') && !hasApplied
                ? () => setShowApplyModal(true)
                : undefined
            }
            hasApplied={hasApplied}
          />
        </div>
      </div>

      {/* Apply Modal */}
      {vacancy && (
        <ApplyToVacancyModal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          vacancy={vacancy}
          onSuccess={(vacancyId) => {
            void vacancyId
            // ⚡ OPTIMISTIC UPDATE: Instant UI feedback
            setHasApplied(true)
            
            // Background sync to ensure consistency
            refreshApplicationStatus()
          }}
          onError={(vacancyId) => {
            void vacancyId
            // 🔄 ROLLBACK: Revert optimistic update on error
            setHasApplied(false)
            refreshApplicationStatus()
          }}
        />
      )}
    </>
  )
}
