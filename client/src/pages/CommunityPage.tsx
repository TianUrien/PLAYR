/**
 * CommunityPage
 * 
 * Container page for the Community section with two modes:
 * - People: Member directory for discovering players, coaches, and clubs
 * - Questions: Q&A for sharing knowledge in the field hockey world
 */

import { useLocation } from 'react-router-dom'
import { Header } from '@/components'
import {
  CommunityModeSwitcher,
  PeopleListView,
  QuestionsListView,
} from '@/components/community'
import type { CommunityMode } from '@/components/community'

export default function CommunityPage() {
  const location = useLocation()
  
  // Determine mode from URL
  const mode: CommunityMode = location.pathname.includes('/community/questions')
    ? 'questions'
    : 'people'

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-transparent bg-clip-text italic">
              Community
            </span>
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Connect with players, coaches, and clubs around the world.
          </p>

          {/* Mode Switcher */}
          <CommunityModeSwitcher mode={mode} />
        </div>

        {/* Content based on mode */}
        <div className="mt-10">
          {mode === 'people' ? (
            <PeopleListView />
          ) : (
            <QuestionsListView />
          )}
        </div>
      </main>
    </div>
  )
}
