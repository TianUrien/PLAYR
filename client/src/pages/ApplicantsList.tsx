import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import type { VacancyApplicationWithPlayer, Vacancy, Json } from '@/lib/supabase'
import ApplicantCard from '@/components/ApplicantCard'

export default function ApplicantsList() {
  const { vacancyId } = useParams<{ vacancyId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [vacancy, setVacancy] = useState<Vacancy | null>(null)
  const [applications, setApplications] = useState<VacancyApplicationWithPlayer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      if (!vacancyId || !user) return

      setIsLoading(true)
      setError(null)

      try {
        // Fetch vacancy details
        const { data: vacancyData, error: vacancyError } = await supabase
          .from('vacancies')
          .select('*')
          .eq('id', vacancyId)
          .eq('club_id', user.id) // Ensure club owns this vacancy
          .single()

        if (vacancyError) {
          if (vacancyError.code === 'PGRST116') {
            setError('Vacancy not found or you do not have permission to view it.')
          } else {
            throw vacancyError
          }
          return
        }

        setVacancy(vacancyData)

        // Fetch applications with player profiles
        const { data: applicationsData, error: applicationsError } = await supabase
          .from('vacancy_applications')
          .select(`
            *,
            player:player_id (
              id,
              full_name,
              avatar_url,
              position,
              secondary_position,
              base_location,
              nationality,
              username
            )
          `)
          .eq('vacancy_id', vacancyId)
          .order('applied_at', { ascending: false })

        if (applicationsError) {
          throw applicationsError
        }

        // Transform the data to match our type
        interface ApplicationWithProfile {
          id: string
          vacancy_id: string
          player_id: string
          cover_letter: string | null
          status: string
          applied_at: string
          updated_at: string
          metadata: Json
          player: {
            id: string
            full_name: string
            avatar_url: string | null
            position: string | null
            secondary_position: string | null
            base_location: string
            nationality: string
            username: string | null
          }
        }

        const transformedApplications: VacancyApplicationWithPlayer[] = (applicationsData as ApplicationWithProfile[] || []).map((app) => ({
          id: app.id,
          vacancy_id: app.vacancy_id,
          player_id: app.player_id,
          cover_letter: app.cover_letter,
          status: app.status as VacancyApplicationWithPlayer['status'],
          applied_at: app.applied_at,
          updated_at: app.updated_at,
          metadata: app.metadata as Json,
          player: {
            id: app.player.id,
            full_name: app.player.full_name,
            avatar_url: app.player.avatar_url,
            position: app.player.position,
            secondary_position: app.player.secondary_position,
            base_location: app.player.base_location,
            nationality: app.player.nationality,
            username: app.player.username,
          },
        }))

        setApplications(transformedApplications)
      } catch {
        setError('Failed to load applicants. Please try again.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [vacancyId, user])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading applicants...</p>
        </div>
      </div>
    )
  }

  if (error || !vacancy) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Vacancy not found.'}</p>
          <button
            onClick={() => navigate('/dashboard/profile')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex w-fit items-center gap-2 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Vacancies
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Applicants for {vacancy.title}
            </h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <Users className="h-4 w-4" />
              {applications.length} applicant{applications.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {applications.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <div className="mb-4 text-5xl">📭</div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 sm:text-xl">No Applicants Yet</h3>
            <p className="text-sm text-gray-600 sm:text-base">
              Applications will appear here once players start applying to this opportunity.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {applications.map((application) => (
              <ApplicantCard key={application.id} application={application} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
