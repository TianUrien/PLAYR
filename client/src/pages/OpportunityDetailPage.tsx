import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/auth'
import { logger } from '../lib/logger'
import type { Opportunity } from '../lib/supabase'
import Header from '../components/Header'
import OpportunityDetailView from '../components/OpportunityDetailView'
import ApplyToOpportunityModal from '../components/ApplyToOpportunityModal'
import SignInPromptModal from '../components/SignInPromptModal'
import OpportunityJsonLd from '../components/OpportunityJsonLd'
import Breadcrumbs from '../components/Breadcrumbs'

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const isCurrentUserTestAccount = profile?.is_test_account ?? false
  
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null)
  const [club, setClub] = useState<{ id: string; full_name: string | null; avatar_url: string | null; role: string | null; current_club: string | null } | null>(null)
  const [hasApplied, setHasApplied] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [showSignInPrompt, setShowSignInPrompt] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchVacancyDetails = useCallback(async () => {
    if (!id) return

    try {
      // Fetch opportunity with club details including is_test_account
      const { data: opportunityData, error: opportunityError } = await supabase
        .from('opportunities')
        .select(`
          *,
          club:profiles!opportunities_club_id_fkey(
            id,
            full_name,
            avatar_url,
            is_test_account,
            role,
            current_club
          )
        `)
        .eq('id', id)
        .eq('status', 'open')
        .single()

      if (opportunityError || !opportunityData) {
        logger.error('Opportunity not found:', opportunityError)
        setNotFound(true)
        return
      }

      // Check if this is a test opportunity and current user is not a test account
      const opportunityWithClub = opportunityData as Opportunity & { club?: { id: string; full_name: string | null; avatar_url: string | null; is_test_account?: boolean; role?: string | null; current_club?: string | null } }
      if (opportunityWithClub.club?.is_test_account && !isCurrentUserTestAccount) {
        // Real users cannot view test opportunities
        logger.debug('Test opportunity not accessible to non-test user')
        setNotFound(true)
        return
      }

      setOpportunity(opportunityData as Opportunity)

      // Set club from the joined data
      if (opportunityWithClub.club) {
        setClub({
          id: opportunityWithClub.club.id,
          full_name: opportunityWithClub.club.full_name,
          avatar_url: opportunityWithClub.club.avatar_url,
          role: opportunityWithClub.club.role ?? null,
          current_club: opportunityWithClub.club.current_club ?? null,
        })
      }

      // Check if user has applied
      if (user && (profile?.role === 'player' || profile?.role === 'coach')) {
        const { data: applicationData } = await supabase
          .from('opportunity_applications')
          .select('id')
          .eq('opportunity_id', id)
          .eq('applicant_id', user.id)
          .single()

        setHasApplied(!!applicationData)
      }
    } catch (error) {
      logger.error('Error fetching opportunity details:', error)
      setNotFound(true)
    } finally {
      setIsLoading(false)
    }
  }, [id, user, profile, isCurrentUserTestAccount])

  useEffect(() => {
    if (!id) {
      navigate('/opportunities')
      return
    }

    fetchVacancyDetails()
  }, [id, navigate, fetchVacancyDetails])

  // SEO: Update page title and meta tags for crawlers
  useEffect(() => {
    if (!opportunity || !club) {
      document.title = 'Field Hockey Opportunity | PLAYR'
      return
    }

    // Dynamic page title
    const pageTitle = `${opportunity.title} at ${club.full_name || 'Club'} | PLAYR`
    document.title = pageTitle

    // Build meta description
    const location = [opportunity.location_city, opportunity.location_country].filter(Boolean).join(', ')
    const metaDescription = `${opportunity.title} opportunity at ${club.full_name || 'a club'}${location ? ` in ${location}` : ''}. ${opportunity.description?.slice(0, 120) || 'Apply now on PLAYR - the field hockey community platform.'}`

    // Update or create meta description
    const metaDescTag = document.querySelector('meta[name="description"]')
    if (metaDescTag) {
      metaDescTag.setAttribute('content', metaDescription)
    }

    // Update Open Graph tags
    const ogTitle = document.querySelector('meta[property="og:title"]')
    if (ogTitle) ogTitle.setAttribute('content', pageTitle)

    const ogDesc = document.querySelector('meta[property="og:description"]')
    if (ogDesc) ogDesc.setAttribute('content', metaDescription)

    const ogUrl = document.querySelector('meta[property="og:url"]')
    if (ogUrl) ogUrl.setAttribute('content', `https://www.oplayr.com/opportunities/${opportunity.id}`)

    // Update Twitter tags
    const twitterTitle = document.querySelector('meta[name="twitter:title"]')
    if (twitterTitle) twitterTitle.setAttribute('content', pageTitle)

    const twitterDesc = document.querySelector('meta[name="twitter:description"]')
    if (twitterDesc) twitterDesc.setAttribute('content', metaDescription)

    // Cleanup: restore defaults when leaving page
    return () => {
      document.title = 'PLAYR | Field Hockey Community'
      const defaultDesc = 'Connect players, coaches, and clubs. Raise the sport together. Join PLAYR.'
      
      if (metaDescTag) metaDescTag.setAttribute('content', defaultDesc)
      if (ogTitle) ogTitle.setAttribute('content', 'PLAYR | Field Hockey Community')
      if (ogDesc) ogDesc.setAttribute('content', defaultDesc)
      if (ogUrl) ogUrl.setAttribute('content', 'https://www.oplayr.com')
      if (twitterTitle) twitterTitle.setAttribute('content', 'PLAYR | Field Hockey Community')
      if (twitterDesc) twitterDesc.setAttribute('content', defaultDesc)
    }
  }, [opportunity, club])

  const refreshApplicationStatus = async () => {
    // Allow both players and coaches to refresh their application status
    if (!id || !user || !['player', 'coach'].includes(profile?.role ?? '')) return

    const { data } = await supabase
      .from('opportunity_applications')
      .select('id')
      .eq('opportunity_id', id)
      .eq('applicant_id', user.id)
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

  if (notFound || !opportunity || !club) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center" style={{ height: 'calc(100vh - 80px)', paddingTop: '80px' }}>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Opportunity Not Found</h1>
            <p className="text-gray-600 mb-6">This opportunity may have been closed or removed.</p>
            <button
              onClick={() => navigate('/opportunities')}
              className="px-6 py-3 bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Browse Opportunities
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Determine what happens when user clicks "Apply"
  const handleApplyClick = () => {
    if (!user) {
      // Not authenticated - show sign-in prompt
      setShowSignInPrompt(true)
    } else if ((profile?.role === 'player' || profile?.role === 'coach') && !hasApplied) {
      // Authenticated player/coach who hasn't applied - show apply modal
      setShowApplyModal(true)
    }
    // Clubs or users who have already applied - button shouldn't be shown
  }

  // Determine if user can apply (or should see the apply button)
  const canShowApplyButton = !hasApplied && (
    !user || // Not logged in - show button to trigger sign-in prompt
    profile?.role === 'player' || 
    profile?.role === 'coach'
  )

  return (
    <>
      {/* Structured data for AI discoverability */}
      <OpportunityJsonLd
        vacancy={opportunity} 
        club={{
          name: club.full_name || 'Unknown Club',
          logoUrl: club.avatar_url,
        }}
      />
      
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-20">
          <div className="max-w-4xl mx-auto px-4 md:px-6 pt-4 pb-2">
            <Breadcrumbs
              items={[
                { label: 'Opportunities', to: '/opportunities' },
                { label: opportunity.title },
              ]}
            />
          </div>
          <OpportunityDetailView
            vacancy={opportunity}
            clubName={club.full_name || 'Unknown Club'}
            clubLogo={club.avatar_url}
            clubId={club.id}
            publisherRole={club.role}
            publisherOrganization={opportunity.organization_name || club.current_club || null}
            onClose={() => navigate('/opportunities')}
            onApply={canShowApplyButton ? handleApplyClick : undefined}
            hasApplied={hasApplied}
          />
        </div>
      </div>

      {/* Sign In Prompt Modal - for unauthenticated users */}
      <SignInPromptModal
        isOpen={showSignInPrompt}
        onClose={() => setShowSignInPrompt(false)}
        title="Sign in to apply"
        message="Sign in or create a free PLAYR account to apply to this opportunity."
      />

      {/* Apply Modal */}
      {opportunity && (
        <ApplyToOpportunityModal
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          vacancy={opportunity}
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
