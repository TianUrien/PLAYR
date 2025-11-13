import { useState } from 'react'
import { MapPin, Globe, Calendar, Plus, Eye, MessageCircle, Edit, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, EditProfileModal } from '@/components'
import Header from '@/components/Header'
import VacanciesTab from '@/components/VacanciesTab'
import ClubMediaTab from '@/components/ClubMediaTab'
import type { Profile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useToastStore } from '@/lib/toast'
import Skeleton from '@/components/Skeleton'

type TabType = 'overview' | 'media' | 'vacancies' | 'players'

interface ClubDashboardProps {
  profileData?: Profile
  readOnly?: boolean
}

export default function ClubDashboard({ profileData, readOnly = false }: ClubDashboardProps) {
  const { profile: authProfile, user } = useAuthStore()
  const profile = profileData || authProfile
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [showEditModal, setShowEditModal] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [triggerCreateVacancy, setTriggerCreateVacancy] = useState(false)


  const handleCreateVacancyClick = () => {
    // Switch to vacancies tab
    setActiveTab('vacancies')
    // Trigger the vacancy creation modal
    setTriggerCreateVacancy(true)
  }

  const handleSendMessage = async () => {
    if (!user || !profileData) return
    
    setSendingMessage(true)
    try {
      // Check if conversation already exists
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('id')
        .or(`and(participant_one_id.eq.${user.id},participant_two_id.eq.${profileData.id}),and(participant_one_id.eq.${profileData.id},participant_two_id.eq.${user.id})`)
        .single()

      if (existingConv) {
        // Navigate to existing conversation
        navigate(`/messages?conversation=${existingConv.id}`)
      } else {
        // Create new conversation
        const { data: newConv, error } = await supabase
          .from('conversations')
          .insert({
            participant_one_id: user.id,
            participant_two_id: profileData.id
          })
          .select('id')
          .single()

        if (error) throw error
        navigate(`/messages?conversation=${newConv.id}`)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
      addToast('Failed to start conversation. Please try again.', 'error')
    } finally {
      setSendingMessage(false)
    }
  }

  const tabs: { id: TabType; label: string }[] = readOnly
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'media', label: 'Media' },
        { id: 'vacancies', label: 'Vacancies' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'media', label: 'Media' },
        { id: 'vacancies', label: 'Vacancies' },
        { id: 'players', label: 'Players' },
      ]

  const getInitials = (name: string | null) => {
    if (!name) return '?'  // Return placeholder for null/undefined
    
    return name
      .trim()
      .split(' ')
      .filter(n => n.length > 0)  // Handle multiple spaces
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)  // Limit to 2 characters
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center">
              <Skeleton variant="circular" width={96} height={96} className="flex-shrink-0" />
              <div className="flex-1 space-y-4">
                <Skeleton width="60%" height={40} />
                <div className="flex flex-wrap gap-4">
                  <Skeleton width={160} height={24} />
                  <Skeleton width={140} height={24} />
                  <Skeleton width={120} height={24} />
                </div>
                <Skeleton width={90} height={28} className="rounded-full" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white shadow-sm">
            <div className="sticky top-[68px] z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
              <div className="flex gap-6 overflow-x-auto px-6 py-4">
                {tabs.map(tab => (
                  <div key={tab.id} className="flex flex-col items-start space-y-2">
                    <Skeleton width={80} height={24} />
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6 p-6 md:p-8">
              <Skeleton width="40%" height={28} />
              <Skeleton width="100%" height={120} />
              <Skeleton width="100%" height={120} />
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Club Header */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm mb-6 animate-fade-in">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Club Logo */}
            <Avatar
              src={profile.avatar_url}
              initials={getInitials(profile.full_name)}
              size="xl"
              className="flex-shrink-0"
            />

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                  {profile.full_name}
                </h1>
                {readOnly ? (
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                      <Eye className="w-4 h-4" />
                      Public View
                    </div>
                    <button
                      onClick={handleSendMessage}
                      disabled={sendingMessage}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:shadow-lg transition-all text-sm font-medium disabled:opacity-50"
                    >
                      {sendingMessage ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <MessageCircle className="w-4 h-4" />
                      )}
                      {sendingMessage ? 'Starting...' : 'Message'}
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  <span className="font-medium">{profile.nationality}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  <span>{profile.base_location}</span>
                </div>
                {profile.year_founded && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    <span>Founded {profile.year_founded}</span>
                  </div>
                )}
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-50 text-orange-700 rounded-full text-sm font-medium">
                <span className="w-2 h-2 bg-orange-500 rounded-full" />
                Club
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Card */}
        <div className="bg-white rounded-2xl shadow-sm animate-slide-in-up">
          {/* Tab Navigation */}
          <div className="sticky top-[68px] z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
            <nav className="flex min-w-max gap-8 px-6 overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 border-b-2 transition-all text-sm font-medium whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#8b5cf6] text-[#8b5cf6]'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6 md:p-8">
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-fade-in">
                {/* Quick Actions - Only show for club owners */}
                {!readOnly && (
                  <div className="bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] rounded-xl p-6 text-white">
                    <h3 className="text-lg font-semibold mb-2">Quick Actions</h3>
                    <p className="text-blue-100 mb-4 text-sm">
                      Manage your club and find the best talent
                    </p>
                    <button 
                      onClick={handleCreateVacancyClick}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#6366f1] rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Create Vacancy
                    </button>
                  </div>
                )}

                {/* Club Information */}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Club Information</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Club Name
                      </label>
                      <p className="text-gray-900 font-medium">{profile.full_name}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Location
                      </label>
                      <p className="text-gray-900">{profile.base_location}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Country
                      </label>
                      <p className="text-gray-900">{profile.nationality}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Year Founded
                      </label>
                      <p className={profile.year_founded ? "text-gray-900" : "text-gray-500 italic"}>
                        {profile.year_founded || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        League/Division
                      </label>
                      <p className={profile.league_division ? "text-gray-900" : "text-gray-500 italic"}>
                        {profile.league_division || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Website
                      </label>
                      {profile.website ? (
                        <a 
                          href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#6366f1] hover:text-[#4f46e5] underline"
                        >
                          {profile.website}
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Email
                      </label>
                      {profile.contact_email ? (
                        <a 
                          href={`mailto:${profile.contact_email}`}
                          className="text-[#6366f1] hover:text-[#4f46e5] underline"
                        >
                          {profile.contact_email}
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>
                  </div>

                  {/* Club Bio */}
                  <div className="mt-8">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      About the Club
                    </label>
                    <p className={profile.club_bio ? "text-gray-700 leading-relaxed" : "text-gray-500 italic"}>
                      {profile.club_bio || 'No description provided'}
                    </p>
                  </div>

                  {/* Club History */}
                  <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Club History
                    </label>
                    <p className={profile.club_history ? "text-gray-700 leading-relaxed" : "text-gray-500 italic"}>
                      {profile.club_history || 'No history provided'}
                    </p>
                  </div>
                </div>

                {/* Edit Button - Only show for club owners */}
                {!readOnly && (
                  <div className="pt-6 border-t border-gray-200">
                    <button 
                      onClick={() => setShowEditModal(true)}
                      className="px-6 py-3 bg-[#8b5cf6] text-white rounded-lg hover:bg-[#7c3aed] transition-colors font-medium"
                    >
                      Update Club Information
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'vacancies' && (
              <div className="animate-fade-in">
                <VacanciesTab 
                  profileId={profile.id} 
                  readOnly={readOnly} 
                  triggerCreate={triggerCreateVacancy}
                  onCreateTriggered={() => setTriggerCreateVacancy(false)}
                />
              </div>
            )}

            {activeTab === 'media' && (
              <div className="animate-fade-in">
                <ClubMediaTab 
                  clubId={profile.id} 
                  readOnly={readOnly}
                />
              </div>
            )}

            {activeTab === 'players' && (
              <div className="text-center py-12 animate-fade-in">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">👥</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Players Coming Soon
                </h3>
                <p className="text-gray-600">
                  This section is under development and will be available soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        role="club"
      />
    </div>
  )
}
