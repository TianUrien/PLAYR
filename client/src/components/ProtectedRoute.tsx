import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/lib/auth'

interface ProtectedRouteProps {
  children: React.ReactNode
}

const PUBLIC_ROUTES = ['/', '/signup', '/verify-email', '/auth/callback', '/privacy-policy', '/terms']

/**
 * ProtectedRoute - Centralized auth guard
 * 
 * Uses global auth store (useAuthStore) instead of local state
 * to prevent duplicate auth listeners and state management conflicts.
 * 
 * Public routes (allowlist): /, /signup, /verify-email, /auth/callback
 * Protected routes: Everything else requires authentication
 * 
 * IMPORTANT: Never redirect from /auth/callback or /verify-email
 * before auth processing completes
 * 
 * Uses shallow selectors to minimize re-renders
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const user = useAuthStore(state => state.user)
  const loading = useAuthStore(state => state.loading)

  useEffect(() => {
    console.log('[PROTECTED_ROUTE]', {
      path: location.pathname,
      loading,
      hasUser: !!user,
      isPublic: PUBLIC_ROUTES.some(route => location.pathname.startsWith(route))
    })
  }, [location.pathname, loading, user])

  // Show loading while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#6366f1] mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Check if current route is public
  const isPublicRoute = PUBLIC_ROUTES.some(route =>
    route === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(route)
  )

  // Public routes - allow access regardless of auth status
  if (isPublicRoute) {
    return <>{children}</>
  }

  // Protected routes - require authentication
  if (!user) {
    // Store intended destination for redirect after login
    return <Navigate to="/" state={{ from: location.pathname }} replace />
  }

  return <>{children}</>
}
