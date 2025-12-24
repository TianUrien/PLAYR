import type { ReactNode } from 'react'
import MobileBottomNav from './MobileBottomNav'
import NotificationBridge from './NotificationBridge'
import NotificationsDrawer from './NotificationsDrawer'

interface LayoutProps {
  children: ReactNode
  className?: string
}

export default function Layout({ children, className = '' }: LayoutProps) {
  return (
    <div className="flex min-h-screen-dvh flex-col">
      <NotificationBridge />
      <NotificationsDrawer />
      {/* Main content area */}
      <main className={`flex flex-1 min-h-0 flex-col ${className}`}>
        {children}
      </main>

      {/* Mobile Bottom Navigation - Instagram style */}
      <MobileBottomNav />
    </div>
  )
}
