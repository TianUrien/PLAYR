import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Users, Briefcase, Bell, Globe } from 'lucide-react'
import { Avatar, NotificationBadge } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'
import { useOpportunityNotifications } from '@/hooks/useOpportunityNotifications'
import { useNotificationStore } from '@/lib/notifications'

export default function Header() {
  const navigate = useNavigate()
  const { user, profile } = useAuthStore()
  const { count: unreadCount } = useUnreadMessages()
  const { count: opportunityCount } = useOpportunityNotifications()
  const notificationCount = useNotificationStore((state) => state.unreadCount)
  const toggleNotificationDrawer = useNotificationStore((state) => state.toggleDrawer)
  const closeNotificationsDrawer = () => toggleNotificationDrawer(false)
  const headerRef = useRef<HTMLElement>(null)
  const fullName = profile?.full_name ?? ''
  const profileInitials = fullName
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('') || '?'

  useEffect(() => {
    if (typeof window === 'undefined' || !headerRef.current) {
      return
    }

    const updateHeaderMetrics = () => {
      if (!headerRef.current) {
        return
      }

      const root = document.documentElement
      const headerHeight = headerRef.current.offsetHeight
      const safeAreaTop = parseFloat(
        getComputedStyle(root).getPropertyValue('--app-safe-area-top') || '0'
      )

      root.style.setProperty('--app-header-height', `${headerHeight}px`)
      root.style.setProperty('--app-header-offset', `${headerHeight + safeAreaTop}px`)
    }

    updateHeaderMetrics()

    let observer: ResizeObserver | null = null

    if ('ResizeObserver' in window) {
      observer = new ResizeObserver(() => updateHeaderMetrics())
      observer.observe(headerRef.current)
    }

    window.addEventListener('resize', updateHeaderMetrics)
    window.addEventListener('orientationchange', updateHeaderMetrics)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateHeaderMetrics)
      window.removeEventListener('orientationchange', updateHeaderMetrics)
    }
  }, [])

  const handleNavigate = (path: string) => {
    closeNotificationsDrawer()
    navigate(path)
  }

  return (
    <header
      ref={headerRef}
      className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200"
    >
      <nav className="max-w-7xl mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => handleNavigate(user ? '/opportunities' : '/')}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img 
                src="/New-LogoBlack.svg" 
                alt="PLAYR" 
                className="h-8"
              />
            </button>
            
            <span className="hidden md:inline-block px-3 py-1 rounded-full text-xs font-medium text-white bg-[#ff9500]">
              The Home of Field Hockey.
            </span>
          </div>

          {/* Mobile Navigation - Notifications only (rest in bottom nav) */}
          {user && profile && (
            <div className="flex md:hidden items-center">
              <button
                onClick={() => toggleNotificationDrawer()}
                className="relative p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                <NotificationBadge count={notificationCount} className="-right-0.5 -top-0.5" />
              </button>
            </div>
          )}

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            {user && profile ? (
              <>
                <button
                  onClick={() => handleNavigate('/community')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    <span>Community</span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigate('/world')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    <span>World</span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigate('/opportunities')}
                  className="relative text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    <span>Opportunities</span>
                  </div>
                  <NotificationBadge count={opportunityCount} className="-right-3 -top-2" />
                </button>
                <button
                  onClick={() => handleNavigate('/messages')}
                  className="relative text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    <span>Messages</span>
                  </div>
                  <NotificationBadge count={unreadCount} />
                </button>
                <button
                  onClick={() => toggleNotificationDrawer()}
                  className="relative text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5" />
                    <span>Notifications</span>
                  </div>
                  <NotificationBadge count={notificationCount} className="-right-3 -top-2" />
                </button>
                
                {/* Profile Avatar - Direct Dashboard Navigation */}
                <button 
                  onClick={() => handleNavigate('/dashboard/profile')}
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  aria-label="Go to Dashboard"
                >
                  <Avatar
                    src={profile.avatar_url}
                    initials={profileInitials}
                    size="sm"
                  />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleNavigate('/community')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    <span>Community</span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigate('/world')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5" />
                    <span>World</span>
                  </div>
                </button>
                <button
                  onClick={() => handleNavigate('/opportunities')}
                  className="relative text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-5 h-5" />
                    <span>Opportunities</span>
                  </div>
                  <NotificationBadge count={opportunityCount} className="-right-3 -top-2" />
                </button>
                <button
                  onClick={() => handleNavigate('/')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors px-4 py-2"
                >
                  Sign In
                </button>
                <button
                  onClick={() => handleNavigate('/signup')}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  Join PLAYR
                </button>
              </>
            )}
          </div>

        </div>

        {/* Mobile Menu - Hidden, navigation handled by MobileBottomNav */}
      </nav>
    </header>
  )
}
