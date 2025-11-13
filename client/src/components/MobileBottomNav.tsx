import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Users, Briefcase, MessageCircle, LayoutDashboard, Settings, LogOut } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, NotificationBadge } from '@/components'
import { useUnreadMessages } from '@/hooks/useUnreadMessages'
import { useToastStore } from '@/lib/toast'

interface NavItem {
  id: string
  label: string
  path: string
  icon: React.ComponentType<{ className?: string }>
}

export default function MobileBottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, user, signOut } = useAuthStore()
  const { count: unreadCount } = useUnreadMessages()
  const { addToast } = useToastStore()
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [isHidden, setIsHidden] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const messagingMobileV2Enabled = import.meta.env.VITE_MESSAGING_MOBILE_V2 === 'true'

  // Navigation items
  const navItems: NavItem[] = [
    {
      id: 'community',
      label: 'Community',
      path: '/community',
      icon: Users,
    },
    {
      id: 'opportunities',
      label: 'Opportunities',
      path: '/opportunities',
      icon: Briefcase,
    },
    {
      id: 'messages',
      label: 'Messages',
      path: '/messages',
      icon: MessageCircle,
    },
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/dashboard/profile',
      icon: LayoutDashboard,
    },
  ]

  // Check if path is active
  const isActive = (path: string) => {
    if (path === '/dashboard/profile') {
      return location.pathname.startsWith('/dashboard')
    }
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  // Handle keyboard visibility (iOS specific)
  useEffect(() => {
    const handleResize = () => {
      // Detect keyboard on mobile by checking if viewport height decreased significantly
      if (typeof window !== 'undefined' && window.visualViewport) {
        const viewportHeight = window.visualViewport.height
        const windowHeight = window.innerHeight
        const heightDiff = windowHeight - viewportHeight
        
        // If height difference is significant (> 150px), keyboard is likely open
        setIsKeyboardOpen(heightDiff > 150)
      }
    }

    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize)
      return () => window.visualViewport?.removeEventListener('resize', handleResize)
    }
  }, [])

  // Hide on certain routes (modals, auth pages)
  useEffect(() => {
    const hiddenRoutes = ['/', '/signup', '/login', '/complete-profile']
    const searchParams = new URLSearchParams(location.search)
    const isConversationPath = location.pathname.startsWith('/messages/')
    const isImmersiveMessagesView =
      location.pathname.startsWith('/messages') &&
      (searchParams.has('conversation') || searchParams.has('new'))
    const shouldHide =
      hiddenRoutes.some(route => location.pathname === route) ||
      isImmersiveMessagesView ||
      (messagingMobileV2Enabled && isConversationPath)
    setIsHidden(shouldHide)
  }, [location.pathname, location.search, messagingMobileV2Enabled])

  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false)
      }
    }

    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [profileMenuOpen])

  // Don't render if user is not authenticated or on hidden routes
  if (!user || !profile || isHidden) {
    return null
  }

  // Hide when keyboard is open
  if (isKeyboardOpen) {
    return null
  }

  const getInitials = (name: string | null) => {
    if (!name) return '?'
    return name
      .trim()
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <>
      {/* Spacer to prevent content from being hidden behind fixed nav */}
      <div className="h-20 md:hidden" aria-hidden="true" />

      {/* Bottom Navigation */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-gray-200/50 shadow-lg pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <div className="flex items-center justify-around px-2 pt-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-3 rounded-xl transition-all duration-200 ${
                  active 
                    ? 'text-[#6366f1]' 
                    : 'text-gray-600 active:bg-gray-100'
                }`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <div className={`relative flex items-center justify-center w-7 h-7 mb-0.5 transition-transform duration-200 ${
                  active ? 'scale-110' : 'scale-100'
                }`}>
                  <Icon 
                    className={`w-6 h-6 transition-all duration-200 ${
                      active ? 'stroke-[2.5]' : 'stroke-[2]'
                    }`}
                  />
                  {item.id === 'messages' && (
                    <NotificationBadge count={unreadCount} />
                  )}
                  {active && (
                    <div className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] opacity-20 rounded-full blur-md" />
                  )}
                </div>
                <span 
                  className={`text-[10px] font-medium transition-all duration-200 ${
                    active ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            )
          })}

          {/* Profile Avatar with Menu */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[48px] py-1 px-3 rounded-xl transition-all duration-200 ${
                profileMenuOpen || location.pathname === '/dashboard/profile'
                  ? 'text-[#6366f1]'
                  : 'text-gray-600 active:bg-gray-100'
              }`}
              aria-label="Profile menu"
              aria-haspopup="true"
            >
              <div className={`relative mb-0.5 transition-transform duration-200 ${
                profileMenuOpen || location.pathname === '/dashboard/profile' ? 'scale-110' : 'scale-100'
              }`}>
                <Avatar
                  src={profile.avatar_url}
                  initials={getInitials(profile.full_name)}
                  size="sm"
                  className={`transition-all duration-200 ${
                    profileMenuOpen || location.pathname === '/dashboard/profile'
                      ? 'ring-2 ring-[#6366f1] ring-offset-2'
                      : ''
                  }`}
                />
                {(profileMenuOpen || location.pathname === '/dashboard/profile') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] opacity-20 rounded-full blur-md" />
                )}
              </div>
              <span 
                className={`text-[10px] font-medium transition-all duration-200 ${
                  profileMenuOpen || location.pathname === '/dashboard/profile' ? 'opacity-100' : 'opacity-0'
                }`}
              >
                Profile
              </span>
            </button>

            {/* Profile Menu Popup */}
            {profileMenuOpen && (
              <div 
                className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-200/50 py-2 z-50 animate-slide-in-up"
                role="menu"
                aria-orientation="vertical"
              >
                <button
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/settings')
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
                  role="menuitem"
                >
                  <Settings className="w-5 h-5" />
                  Settings
                </button>
                <div className="h-px bg-gray-200 my-1" />
                <button
                  onClick={async () => {
                    setProfileMenuOpen(false)
                    try {
                      await signOut()
                      navigate('/')
                    } catch (error) {
                      console.error('Failed to sign out', error)
                      addToast('Could not sign out. Please try again.', 'error')
                    }
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
                  role="menuitem"
                >
                  <LogOut className="w-5 h-5" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
