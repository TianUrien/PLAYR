import { useState } from 'react'
import { MapPin, Globe, Calendar, Edit2, MessageCircle, Award } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, EditProfileModal } from '@/components'
import Header from '@/components/Header'
import MediaTab from '@/components/MediaTab'
import type { Profile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useToastStore } from '@/lib/toast'

type TabType = 'profile' | 'media' | 'experience'

interface CoachDashboardProps {
  profileData?: Profile
  readOnly?: boolean
}

export default function CoachDashboard({ profileData, readOnly = false }: CoachDashboardProps) {
  const { profile: authProfile, user } = useAuthStore()
  const profile = profileData || authProfile
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [showEditModal, setShowEditModal] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const { addToast } = useToastStore()

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
    { id: 'experience', label: 'Experience' },
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Profile Header */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {profile.avatar_url ? (
                <Avatar
                  src={profile.avatar_url}
                  alt={profile.full_name ?? undefined}
                  size="xl"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {getInitials(profile.full_name)}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {profile.full_name}
                  </h1>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium mb-3">
                    <Award className="w-4 h-4" />
                    Coach
                  </div>
                </div>

                {/* Action Buttons */}
                {!readOnly ? (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit Profile
                  </button>
                ) : (
                  <button
                    onClick={handleSendMessage}
                    disabled={sendingMessage}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {sendingMessage ? 'Loading...' : 'Send Message'}
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
                {age && (
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    <span>{age} years old</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm">
          <div className="border-b border-gray-200">
            <nav className="flex gap-8 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-[#6366f1] text-[#6366f1]'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <p className="text-gray-900 font-medium">{profile.full_name}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                      </label>
                      <p className="text-gray-900">{profile.email}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nationality
                      </label>
                      <p className="text-gray-900">{profile.nationality}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Base Location (City)
                      </label>
                      <p className="text-gray-900">{profile.base_location}</p>
                    </div>

                    {profile.gender && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Gender
                        </label>
                        <p className="text-gray-900 capitalize">{profile.gender}</p>
                      </div>
                    )}

                    {profile.date_of_birth && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Date of Birth
                        </label>
                        <p className="text-gray-900">
                          {new Date(profile.date_of_birth).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                          {age && <span className="text-gray-500 ml-2">({age} years old)</span>}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Passports Section */}
                {(profile.passport_1 || profile.passport_2) && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Passports & Eligibility</h3>
                    <div className="space-y-6">
                      {profile.passport_1 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Passport 1
                          </label>
                          <p className="text-gray-900">{profile.passport_1}</p>
                        </div>
                      )}

                      {profile.passport_2 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Passport 2
                          </label>
                          <p className="text-gray-900">{profile.passport_2}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Contact Information */}
                {profile.contact_email && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact</h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Email
                      </label>
                      <a
                        href={`mailto:${profile.contact_email}`}
                        className="text-[#6366f1] hover:underline"
                      >
                        {profile.contact_email}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Media Tab */}
            {activeTab === 'media' && (
              <MediaTab
                profileId={profile.id}
                readOnly={readOnly}
              />
            )}

            {/* Experience Tab - Coming Soon */}
            {activeTab === 'experience' && (
              <div className="text-center py-12 animate-fade-in">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Coaching Experience Coming Soon
                </h3>
                <p className="text-gray-600">
                  This section will display your coaching history, achievements, and certifications.
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
        role={profile.role as 'coach'}
      />
    </div>
  )
}
