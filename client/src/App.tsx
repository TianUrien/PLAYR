import { useEffect, useRef, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initializeAuth } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { ProtectedRoute, ErrorBoundary, Layout, SentryTestButton } from '@/components'
import ToastContainer from '@/components/ToastContainer'
import { ProfileImagePreviewProvider } from '@/components/ProfileImagePreviewProvider'
import InstallPrompt from '@/components/InstallPrompt'
import { useEngagementTracking } from '@/hooks/useEngagementTracking'
import Landing from '@/pages/Landing'
import SignUp from '@/pages/SignUp'
import AuthCallback from '@/pages/AuthCallback'
import VerifyEmail from '@/pages/VerifyEmail'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import PrivacyPolicy from '@/pages/PrivacyPolicy'
import Terms from '@/pages/Terms'
import DevelopersPage from '@/pages/DevelopersPage'
import SettingsPage from '@/pages/SettingsPage'
import OfflinePage from '@/pages/OfflinePage'

// Lazy load heavy components
const CompleteProfile = lazy(() => import('@/pages/CompleteProfile'))
const DashboardRouter = lazy(() => import('@/pages/DashboardRouter'))
const OpportunitiesPage = lazy(() => import('@/pages/OpportunitiesPage'))
const OpportunityDetailPage = lazy(() => import('@/pages/OpportunityDetailPage'))
const CommunityPage = lazy(() => import('@/pages/CommunityPage'))
const QuestionDetailPage = lazy(() => import('@/pages/QuestionDetailPage'))
const ApplicantsList = lazy(() => import('@/pages/ApplicantsList'))
const PublicPlayerProfile = lazy(() => import('@/pages/PublicPlayerProfile'))
const PublicClubProfile = lazy(() => import('@/pages/PublicClubProfile'))
const MessagesPage = lazy(() => import('@/pages/MessagesPage'))

// Lazy load admin components (code splitting)
const AdminGuard = lazy(() => import('@/features/admin/components/AdminGuard').then(m => ({ default: m.AdminGuard })))
const AdminLayout = lazy(() => import('@/features/admin/components/AdminLayout').then(m => ({ default: m.AdminLayout })))
const AdminOverview = lazy(() => import('@/features/admin/pages/AdminOverview').then(m => ({ default: m.AdminOverview })))
const AdminDataIssues = lazy(() => import('@/features/admin/pages/AdminDataIssues').then(m => ({ default: m.AdminDataIssues })))
const AdminDirectory = lazy(() => import('@/features/admin/pages/AdminDirectory').then(m => ({ default: m.AdminDirectory })))
const AdminAuditLog = lazy(() => import('@/features/admin/pages/AdminAuditLog').then(m => ({ default: m.AdminAuditLog })))
const AdminSettings = lazy(() => import('@/features/admin/pages/AdminSettings').then(m => ({ default: m.AdminSettings })))
const AdminVacancies = lazy(() => import('@/features/admin/pages/AdminVacancies').then(m => ({ default: m.AdminVacancies })))
const AdminVacancyDetail = lazy(() => import('@/features/admin/pages/AdminVacancyDetail').then(m => ({ default: m.AdminVacancyDetail })))
const AdminClubs = lazy(() => import('@/features/admin/pages/AdminClubs').then(m => ({ default: m.AdminClubs })))
const AdminPlayers = lazy(() => import('@/features/admin/pages/AdminPlayers').then(m => ({ default: m.AdminPlayers })))
const AdminEngagement = lazy(() => import('@/features/admin/pages/AdminEngagement').then(m => ({ default: m.AdminEngagement })))

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-600 text-sm">Loading...</p>
    </div>
  </div>
)

// Engagement tracking wrapper - tracks time in app via heartbeats
function EngagementTracker() {
  useEngagementTracking()
  return null
}

function App() {
  const initRef = useRef(false)

  useEffect(() => {
    // Guard against React 18 Strict Mode double initialization
    if (initRef.current) {
      logger.debug('[APP] Already initialized, skipping')
      return
    }
    
    initRef.current = true
    logger.debug('[APP] Initializing auth')
    
    // Initialize auth listener
    const subscription = initializeAuth()
    
    return () => {
      logger.debug('[APP] Cleaning up auth')
      subscription.unsubscribe()
      // Reset on actual unmount (not Strict Mode)
      initRef.current = false
    }
  }, [])

  const isProduction = import.meta.env.MODE === 'production' || import.meta.env.VITE_ENVIRONMENT === 'production'

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ProfileImagePreviewProvider>
          <ToastContainer />
          <InstallPrompt />
          <EngagementTracker />
          {!isProduction && <SentryTestButton />}
          <ProtectedRoute>
            <Layout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                {/* Public Routes (allowlisted in ProtectedRoute) */}
                <Route path="/" element={<Landing />} />
                <Route path="/signup" element={<SignUp />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/developers" element={<DevelopersPage />} />
                <Route path="/offline" element={<OfflinePage />} />
                
                {/* Protected Routes (require authentication) - Lazy loaded */}
                <Route path="/complete-profile" element={<CompleteProfile />} />
                <Route path="/community" element={<CommunityPage />} />
                <Route path="/community/questions" element={<CommunityPage />} />
                <Route path="/community/questions/:questionId" element={<QuestionDetailPage />} />
                <Route path="/opportunities" element={<OpportunitiesPage />} />
                <Route path="/opportunities/:id" element={<OpportunityDetailPage />} />
                <Route path="/messages" element={<MessagesPage />} />
                <Route path="/messages/:conversationId" element={<MessagesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/dashboard/profile" element={<DashboardRouter />} />
                <Route path="/dashboard/club/vacancies/:vacancyId/applicants" element={<ApplicantsList />} />

                {/* Network-only profile routes (alias for clarity; still behind auth) */}
                <Route path="/members/:username" element={<PublicPlayerProfile />} />
                <Route path="/members/id/:id" element={<PublicPlayerProfile />} />

                <Route path="/players/:username" element={<PublicPlayerProfile />} />
                <Route path="/players/id/:id" element={<PublicPlayerProfile />} />
                <Route path="/clubs/:username" element={<PublicClubProfile />} />
                <Route path="/clubs/id/:id" element={<PublicClubProfile />} />
                
                {/* Admin Routes - Protected + Admin Guard */}
                <Route path="/admin" element={<AdminGuard><AdminLayout /></AdminGuard>}>
                  <Route index element={<Navigate to="/admin/overview" replace />} />
                  <Route path="overview" element={<AdminOverview />} />
                  <Route path="vacancies" element={<AdminVacancies />} />
                  <Route path="vacancies/:id" element={<AdminVacancyDetail />} />
                  <Route path="clubs" element={<AdminClubs />} />
                  <Route path="players" element={<AdminPlayers />} />
                  <Route path="engagement" element={<AdminEngagement />} />
                  <Route path="data-issues" element={<AdminDataIssues />} />
                  <Route path="directory" element={<AdminDirectory />} />
                  <Route path="audit-log" element={<AdminAuditLog />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
                
                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </Layout>
          </ProtectedRoute>
        </ProfileImagePreviewProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
