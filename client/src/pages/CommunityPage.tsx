/**
 * CommunityPage
 *
 * Container page for the Community section with two tabs:
 * - Members: Unified directory of players, coaches, clubs, and brands
 * - Questions: Q&A for sharing knowledge
 */

import { useParams } from 'react-router-dom'
import { Header } from '@/components'
import {
  CommunityTabSwitcher,
  PeopleListView,
  BrandListView,
  QuestionsListView,
} from '@/components/community'
import type { CommunityTab } from '@/components/community'

const VALID_TABS: CommunityTab[] = ['all', 'players', 'coaches', 'clubs', 'brands', 'questions']

export default function CommunityPage() {
  const { tab } = useParams<{ tab?: string }>()

  // Determine active tab from URL param — default to 'all' (open ecosystem view)
  const activeTab: CommunityTab =
    tab && VALID_TABS.includes(tab as CommunityTab)
      ? (tab as CommunityTab)
      : 'all'

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Hero Section */}
        <div className="text-center mb-5 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-2 sm:mb-4">
            <span className="bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-transparent bg-clip-text italic">
              Community
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-5 sm:mb-8 max-w-md sm:max-w-none mx-auto">
            Connect with players, coaches, clubs, brands, and ask questions.
          </p>

          {/* Tab Switcher */}
          <CommunityTabSwitcher activeTab={activeTab} />
        </div>

        {/* Content based on active tab */}
        <div key={activeTab} className="mt-6 sm:mt-10 animate-fade-in">
          {activeTab === 'all' && <PeopleListView />}
          {activeTab === 'players' && <PeopleListView roleFilter="player" />}
          {activeTab === 'coaches' && <PeopleListView roleFilter="coach" />}
          {activeTab === 'clubs' && <PeopleListView roleFilter="club" />}
          {activeTab === 'brands' && <BrandListView />}
          {activeTab === 'questions' && <QuestionsListView />}
        </div>
      </main>
    </div>
  )
}
