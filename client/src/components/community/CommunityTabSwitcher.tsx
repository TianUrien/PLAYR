import { useNavigate } from 'react-router-dom'
import { Users, GraduationCap, Building2, Store, MessageCircle } from 'lucide-react'

export type CommunityTab = 'players' | 'coaches' | 'clubs' | 'brands' | 'questions'

interface CommunityTabSwitcherProps {
  activeTab: CommunityTab
}

const TABS = [
  { id: 'players' as const, label: 'Players', icon: Users, path: '/community' },
  { id: 'coaches' as const, label: 'Coaches', icon: GraduationCap, path: '/community/coaches' },
  { id: 'clubs' as const, label: 'Clubs', icon: Building2, path: '/community/clubs' },
  { id: 'brands' as const, label: 'Brands', icon: Store, path: '/community/brands' },
  { id: 'questions' as const, label: 'Questions', icon: MessageCircle, path: '/community/questions' },
]

export function CommunityTabSwitcher({ activeTab }: CommunityTabSwitcherProps) {
  const navigate = useNavigate()

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-1 sm:gap-1.5 bg-white rounded-xl p-1 sm:p-1.5 shadow-sm border border-gray-200">
      {TABS.map(tab => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 min-[480px]:px-3 sm:py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            aria-pressed={isActive ? 'true' : 'false'}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden min-[480px]:inline">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
