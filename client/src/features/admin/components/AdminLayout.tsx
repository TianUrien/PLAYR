/**
 * AdminLayout Component
 * 
 * Layout wrapper for admin pages with sidebar navigation.
 */

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Users, 
  AlertTriangle, 
  ScrollText,
  Settings,
  ArrowLeft,
  Briefcase,
  Building2,
  UserCheck,
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/admin/overview', icon: LayoutDashboard, label: 'Overview', exact: true },
  { path: '/admin/vacancies', icon: Briefcase, label: 'Vacancies' },
  { path: '/admin/clubs', icon: Building2, label: 'Club Analytics' },
  { path: '/admin/players', icon: UserCheck, label: 'Player Analytics' },
  { path: '/admin/directory', icon: Users, label: 'Directory' },
  { path: '/admin/data-issues', icon: AlertTriangle, label: 'Data Issues' },
  { path: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
]

export function AdminLayout() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a
                href="/dashboard/profile"
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">Back to App</span>
              </a>
              <div className="h-6 w-px bg-gray-200" />
              <h1 className="text-lg font-semibold text-gray-900">
                <span className="text-purple-600">PLAYR</span> Admin
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                Admin Portal
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.exact
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path)

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <div className="p-4 border-t border-gray-200 mt-4">
            <div className="px-3 py-2 bg-amber-50 rounded-lg">
              <p className="text-xs font-medium text-amber-800">⚠️ Admin Access</p>
              <p className="text-xs text-amber-600 mt-1">
                Actions here affect real user data. Be careful.
              </p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6">
          <div className="max-w-6xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
