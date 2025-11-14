import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, LogOut, Users, Briefcase, LayoutDashboard, Settings, Bell } from 'lucide-react'
import { Avatar, NotificationBadge } from '@/components'
import { useAuthStore } from '@/lib/auth'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'
import { useOpportunityNotifications } from '@/hooks/useOpportunityNotifications'
import { useToastStore } from '@/lib/toast'
import { useNotificationStore } from '@/lib/notifications'

export default function Header() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuthStore()
  const { count: unreadCount } = useUnreadMessages()
  const { count: opportunityCount } = useOpportunityNotifications()
  const notificationCount = useNotificationStore((state) => state.unreadCount)
  const toggleNotificationDrawer = useNotificationStore((state) => state.toggleDrawer)
  const closeNotificationsDrawer = () => toggleNotificationDrawer(false)
  const { addToast } = useToastStore()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const fullName = profile?.full_name ?? ''
  const profileInitials = fullName
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('') || '?'

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

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

  const handleSignOut = async () => {
    try {
      closeNotificationsDrawer()
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Failed to sign out', error)
      addToast('Could not sign out. Please try again.', 'error')
    }
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
              onClick={() => handleNavigate('/')}
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
                <button
                  onClick={() => handleNavigate('/dashboard/profile')}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-5 h-5" />
                    <span>Dashboard</span>
                  </div>
                </button>
                
                {/* Avatar Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button 
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    aria-label="Open user menu"
                    aria-haspopup="true"
                  >
                    <Avatar
                      src={profile.avatar_url}
                      initials={profileInitials}
                      size="sm"
                    />
                    <span className="text-sm font-medium text-gray-700">{fullName || 'Profile'}</span>
                  </button>

                  {/* Dropdown Menu */}
                  {dropdownOpen && (
                    <div 
                      className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
                      role="menu"
                      aria-orientation="vertical"
                    >
                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          handleNavigate('/settings')
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                        role="menuitem"
                      >
                        <Settings className="w-4 h-4" />
                        Settings
                      </button>
                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          handleSignOut()
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                        role="menuitem"
                      >
                        <LogOut className="w-4 h-4" />
                        Sign Out
                      </button>
                    </div>
                  )}
                </div>
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
