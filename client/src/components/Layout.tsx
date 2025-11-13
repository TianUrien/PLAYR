import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Footer from './Footer'
import MobileBottomNav from './MobileBottomNav'

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
    <div className="flex flex-col min-h-screen">
      {/* Main content area - grows to push footer down */}
      <main className={`flex-1 ${className}`}>
        {children}
      </main>

      {/* Footer - hidden on immersive product surfaces */}
      {!shouldHideFooter && <Footer />}

      {/* Mobile Bottom Navigation - Instagram style */}
      <MobileBottomNav />
    </div>
  )
}
