import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Footer from './Footer'
import MobileBottomNav from './MobileBottomNav'
import NotificationBridge from './NotificationBridge'
import NotificationsDrawer from './NotificationsDrawer'

interface LayoutProps {
  children: ReactNode
  className?: string
}

const HIDDEN_FOOTER_PREFIXES = ['/messages', '/onboarding', '/auth', '/dashboard']

export default function Layout({ children, className = '' }: LayoutProps) {
  const location = useLocation()
  const shouldHideFooter = HIDDEN_FOOTER_PREFIXES.some(prefix =>
    location.pathname.startsWith(prefix)
  )

  return (
    <div className="flex min-h-screen-dvh flex-col">
      <NotificationBridge />
      <NotificationsDrawer />
      {/* Main content area - grows to push footer down */}
      <main className={`flex flex-1 min-h-0 flex-col ${className}`}>
        {children}
      </main>

      {/* Footer - hidden on immersive product surfaces */}
      {!shouldHideFooter && <Footer />}

      {/* Mobile Bottom Navigation - Instagram style */}
      <MobileBottomNav />
    </div>
  )
}
