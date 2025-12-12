import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Menu, Settings, LogOut, X } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import { useNotificationStore } from '@/lib/notifications'

/**
 * DashboardMenu - Hamburger menu for Dashboard pages
 * 
 * Contains Settings and Sign Out options.
 * Positioned in the top-right corner of Dashboard pages.
 */
export default function DashboardMenu() {
  const navigate = useNavigate()
  const { signOut } = useAuthStore()
  const { addToast } = useToastStore()
  const toggleNotificationDrawer = useNotificationStore((state) => state.toggleDrawer)
  const closeNotificationsDrawer = () => toggleNotificationDrawer(false)
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined'

  // Close menu when clicking outside (works with portal)
  useEffect(() => {
    const handlePointerDownOutside = (event: Event) => {
      const target = event.target as Node | null
      if (!target) return

      const clickedButton = buttonRef.current?.contains(target) ?? false
      const clickedDropdown = dropdownRef.current?.contains(target) ?? false
      if (!clickedButton && !clickedDropdown) setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handlePointerDownOutside)
      return () => document.removeEventListener('pointerdown', handlePointerDownOutside)
    }
  }, [isOpen])

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleNavigate = (path: string) => {
    setIsOpen(false)
    closeNotificationsDrawer()
    navigate(path)
  }

  const handleSignOut = async () => {
    setIsOpen(false)
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
    <div className="relative">
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        ref={buttonRef}
        className={`p-2.5 rounded-xl transition-all duration-200 ${
          isOpen
            ? 'bg-gray-100 text-gray-900'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : (
          <Menu className="w-5 h-5" />
        )}
      </button>

      {/* Dropdown Menu (portaled to body to avoid clipping/stacking issues on mobile) */}
      {isOpen && canUseDOM &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed right-[calc(1rem+env(safe-area-inset-right))] top-[calc(4.5rem+env(safe-area-inset-top))] w-48 bg-white rounded-xl shadow-2xl border border-gray-200/50 py-2 z-[9999] animate-fade-in"
            role="menu"
            aria-orientation="vertical"
          >
            <button
              onClick={() => handleNavigate('/settings')}
              className="w-full text-left px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-3"
              role="menuitem"
            >
              <Settings className="w-5 h-5" />
              Settings
            </button>
            <div className="h-px bg-gray-200 my-1" />
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3"
              role="menuitem"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
