import { useNavigate } from 'react-router-dom'
import { UserRound, Megaphone, Shield, Store, MessageCircleQuestion } from 'lucide-react'

export type CommunityTab = 'all' | 'players' | 'coaches' | 'clubs' | 'brands' | 'questions'

interface CommunityTabSwitcherProps {
  activeTab: CommunityTab
}

const TABS = [
  { id: 'players' as const, label: 'Players', icon: UserRound, path: '/community/players' },
  { id: 'coaches' as const, label: 'Coaches', icon: Megaphone, path: '/community/coaches' },
  { id: 'clubs' as const, label: 'Clubs', icon: Shield, path: '/community/clubs' },
  { id: 'brands' as const, label: 'Brands', icon: Store, path: '/community/brands' },
  { id: 'questions' as const, label: 'Questions', icon: MessageCircleQuestion, path: '/community/questions' },
]

export function CommunityTabSwitcher({ activeTab }: CommunityTabSwitcherProps) {
  const navigate = useNavigate()

  return (
    <div className="inline-flex items-center gap-1 sm:gap-1.5 bg-white rounded-xl p-1 sm:p-1.5 shadow-sm border border-gray-200 overflow-x-auto max-w-full scrollbar-hide">
      {TABS.map(tab => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id

        return (
          <button
            type="button"
            key={tab.id}
            onClick={() => {
              // Toggle: clicking active tab deselects it (returns to all)
              if (isActive) {
                navigate('/community')
              } else {
                navigate(tab.path)
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white shadow-md'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
            aria-pressed={isActive}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
