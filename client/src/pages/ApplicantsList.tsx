import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import type { OpportunityApplicationWithApplicant, Opportunity, Json } from '@/lib/supabase'
import ApplicantCard from '@/components/ApplicantCard'

export default function ApplicantsList() {
  const { opportunityId } = useParams<{ opportunityId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [applications, setApplications] = useState<OpportunityApplicationWithApplicant[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      if (!opportunityId || !user) return

      setIsLoading(true)
      setError(null)

      try {
        // Fetch opportunity details
        const { data: opportunityData, error: opportunityError } = await supabase
          .from('opportunities')
          .select('*')
          .eq('id', opportunityId)
          .eq('club_id', user.id) // Ensure club owns this opportunity
          .single()

        if (opportunityError) {
          if (opportunityError.code === 'PGRST116') {
            setError('Opportunity not found or you do not have permission to view it.')
          } else {
            throw opportunityError
          }
          return
        }

        setOpportunity(opportunityData)

        // Fetch applications with applicant profiles
        const { data: applicationsData, error: applicationsError } = await supabase
          .from('opportunity_applications')
          .select(`
            *,
            applicant:applicant_id (
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
          .eq('opportunity_id', opportunityId)
          .order('applied_at', { ascending: false })

        if (applicationsError) {
          throw applicationsError
        }

        // Transform the data to match our type
        interface ApplicationWithProfile {
          id: string
          opportunity_id: string
          applicant_id: string
          cover_letter: string | null
          status: string
          applied_at: string
          updated_at: string
          metadata: Json
          applicant: {
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

        const transformedApplications: OpportunityApplicationWithApplicant[] = (applicationsData as ApplicationWithProfile[] || []).map((app) => ({
          id: app.id,
          opportunity_id: app.opportunity_id,
          applicant_id: app.applicant_id,
          cover_letter: app.cover_letter,
          status: app.status as OpportunityApplicationWithApplicant['status'],
          applied_at: app.applied_at,
          updated_at: app.updated_at,
          metadata: app.metadata as Json,
          applicant: {
            id: app.applicant.id,
            full_name: app.applicant.full_name,
            avatar_url: app.applicant.avatar_url,
            position: app.applicant.position,
            secondary_position: app.applicant.secondary_position,
            base_location: app.applicant.base_location,
            nationality: app.applicant.nationality,
            username: app.applicant.username,
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
  }, [opportunityId, user])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-[#8026FA] mb-4"></div>
          <p className="text-gray-600">Loading applicants...</p>
        </div>
      </div>
    )
  }

  if (error || !opportunity) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error || 'Opportunity not found.'}</p>
          <button
            onClick={() => navigate('/dashboard/profile')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white rounded-lg hover:opacity-90 transition-opacity"
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
            Back to Opportunities
          </button>

          <div>
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              Applicants for {opportunity.title}
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
