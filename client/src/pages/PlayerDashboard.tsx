import { useState } from 'react'
import { MapPin, Globe, Calendar, Edit2, Eye, MessageCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, EditProfileModal } from '@/components'
import Header from '@/components/Header'
import MediaTab from '@/components/MediaTab'
import HistoryTab from '@/components/HistoryTab'
import type { Profile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useToastStore } from '@/lib/toast'

type TabType = 'profile' | 'media' | 'history' | 'achievements' | 'availability'

interface PlayerDashboardProps {
  profileData?: Profile
  readOnly?: boolean
}

export default function PlayerDashboard({ profileData, readOnly = false }: PlayerDashboardProps) {
  const { profile: authProfile, user } = useAuthStore()
  const profile = profileData || authProfile
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [showEditModal, setShowEditModal] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)

  if (!profile) return null

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

  const tabs: { id: TabType; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'media', label: 'Media' },
    { id: 'history', label: 'History' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'availability', label: 'Availability' },
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

  const calculateAge = (dateOfBirth: string | null): number | null => {
    if (!dateOfBirth) return null
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age
  }

  const age = calculateAge(profile.date_of_birth)
  const positions = [profile.position, profile.secondary_position].filter((value, index, self): value is string => {
    if (!value) return false
    return self.findIndex((item) => item === value) === index
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm mb-6 animate-fade-in">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Avatar */}
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
                      <MessageCircle className="w-4 h-4" />
                      Message
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowEditModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#4f46e5] transition-colors text-sm font-medium"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Profile
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-gray-600 text-sm md:text-base">
                {/* Nationality */}
                <div className="flex items-center gap-1.5">
                  <Globe className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="font-medium">{profile.nationality}</span>
                </div>
                
                <span className="text-gray-400">•</span>
                
                {/* Base Location */}
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 md:w-5 md:h-5" />
                  <span>{profile.base_location}</span>
                </div>

                {/* Age (if date of birth exists) */}
                {age && (
                  <>
                    <span className="text-gray-400">•</span>
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 md:w-5 md:h-5" />
                      <span>{age} years old</span>
                    </div>
                  </>
                )}

                {/* Position (if specified) */}
                {positions.length > 0 && (
                  <>
                    <span className="text-gray-400">•</span>
                    <div className="flex items-center gap-1.5">
                      <span>🏑</span>
                      <span>{positions.join(' • ')}</span>
                    </div>
                  </>
                )}

                {/* Current Club (if specified) */}
                {profile.current_club && (
                  <>
                    <span className="text-gray-400">•</span>
                    <div className="flex items-center gap-1.5">
                      <span>🏆</span>
                      <span>{profile.current_club}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                <span className="w-2 h-2 bg-blue-500 rounded-full" />
                Player
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Card */}
        <div className="bg-white rounded-2xl shadow-sm animate-slide-in-up">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 overflow-x-auto">
            <nav className="flex gap-8 px-6 min-w-max">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 border-b-2 transition-all text-sm font-medium whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#6366f1] text-[#6366f1]'
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
            {activeTab === 'profile' && (
              <div className="space-y-10 animate-fade-in">
                <section className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">Basic Information</h2>
                    {!readOnly && (
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1] text-white rounded-lg hover:bg-[#4f46e5] transition-colors text-sm font-medium"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit Profile
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <p className="text-gray-900 font-medium">{profile.full_name}</p>
                    </div>

                    {/* Right Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <p className="text-gray-900">{profile.email}</p>
                    </div>

                    {/* Left Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nationality
                      </label>
                      <p className="text-gray-900">{profile.nationality}</p>
                    </div>

                    {/* Right Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Base Location (City)
                      </label>
                      <p className="text-gray-900">{profile.base_location}</p>
                    </div>

                    {/* Left Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Positions
                      </label>
                      <p className={positions.length > 0 ? 'text-gray-900' : 'text-gray-500 italic'}>
                        {positions.length > 0 ? positions.join(' • ') : 'Not specified'}
                      </p>
                    </div>

                    {/* Right Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Gender
                      </label>
                      <p className={profile.gender ? "text-gray-900" : "text-gray-500 italic"}>
                        {profile.gender || 'Not specified'}
                      </p>
                    </div>

                    {/* Left Column */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth {age && `(Age: ${age})`}
                      </label>
                      {profile.date_of_birth ? (
                        <p className="text-gray-900">
                          {new Date(profile.date_of_birth).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </p>
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>

                    <div className="md:col-span-2 space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Passport 1
                        </label>
                        <p className={profile.passport_1 ? "text-gray-900" : "text-gray-500 italic"}>
                          {profile.passport_1 || 'Not specified'}
                        </p>
                      </div>

                      {profile.passport_2 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Passport 2
                          </label>
                          <p className="text-gray-900">{profile.passport_2}</p>
                        </div>
                      )}
                    </div>

                    {/* Left Column */}
                    {profile.current_club && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Current Club
                        </label>
                        <p className="text-gray-900">{profile.current_club}</p>
                      </div>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="pt-6 border-t border-gray-200 md:hidden">
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="w-full px-6 py-3 bg-[#6366f1] text-white rounded-lg hover:bg-[#4f46e5] transition-colors font-medium"
                      >
                        Update Profile Information
                      </button>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="text-2xl font-bold text-gray-900">About Me</h2>
                    {!readOnly && (
                      <button
                        onClick={() => setShowEditModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                      >
                        <Edit2 className="w-4 h-4" />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                    {profile.bio?.trim() ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {profile.bio}
                      </p>
                    ) : (
                      <div className="text-gray-500 italic space-y-2">
                        <p>No bio yet.</p>
                        {!readOnly && (
                          <p>
                            Use the edit option to share your background, playing style, and what you&apos;re looking for in a club.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'media' && (
              <div className="animate-fade-in">
                <MediaTab profileId={profile.id} readOnly={readOnly} />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="animate-fade-in">
                <HistoryTab profileId={profile.id} readOnly={readOnly} />
              </div>
            )}

            {activeTab !== 'profile' && activeTab !== 'media' && activeTab !== 'history' && (
              <div className="text-center py-12 animate-fade-in">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📋</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {tabs.find(t => t.id === activeTab)?.label} Coming Soon
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
        role={profile.role as 'player' | 'coach'}
      />
    </div>
  )
}
