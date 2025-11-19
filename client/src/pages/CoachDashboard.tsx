import { useEffect, useState } from 'react'
import { MapPin, Globe, Calendar, Edit2, MessageCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, EditProfileModal, JourneyTab, CommentsTab, FriendsTab, FriendshipButton, RoleBadge, ScrollableTabs } from '@/components'
import Header from '@/components/Header'
import MediaTab from '@/components/MediaTab'
import Button from '@/components/Button'
import type { Profile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { isUniqueViolationError } from '@/lib/supabaseErrors'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToastStore } from '@/lib/toast'
import { useNotificationStore } from '@/lib/notifications'

type TabType = 'profile' | 'journey' | 'friends' | 'comments'

export type CoachProfileShape =
  Partial<Profile> &
  Pick<
    Profile,
    | 'id'
    | 'role'
    | 'full_name'
    | 'avatar_url'
    | 'base_location'
    | 'bio'
    | 'nationality'
    | 'gender'
    | 'date_of_birth'
    | 'contact_email'
    | 'passport_1'
    | 'passport_2'
  >

interface CoachDashboardProps {
  profileData?: CoachProfileShape
  readOnly?: boolean
}

export default function CoachDashboard({ profileData, readOnly = false }: CoachDashboardProps) {
  const { profile: authProfile, user } = useAuthStore()
  const profile = (profileData ?? authProfile) as CoachProfileShape | null
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const param = searchParams.get('tab') as TabType | null
    return param && ['profile', 'journey', 'friends', 'comments'].includes(param) ? param : 'profile'
  })
  const [showEditModal, setShowEditModal] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const { addToast } = useToastStore()
  const claimCommentHighlights = useNotificationStore((state) => state.claimCommentHighlights)
  const clearCommentNotifications = useNotificationStore((state) => state.clearCommentNotifications)
  const commentHighlightVersion = useNotificationStore((state) => state.commentHighlightVersion)
  const [highlightedComments, setHighlightedComments] = useState<Set<string>>(new Set())

  const tabParam = searchParams.get('tab') as TabType | null

  useEffect(() => {
    if (!tabParam) return
    if (tabParam !== activeTab && ['profile', 'journey', 'friends', 'comments'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  useEffect(() => {
    if (readOnly) {
      return
    }

    if (activeTab !== 'comments') {
      if (highlightedComments.size > 0) {
        setHighlightedComments(new Set())
      }
      return
    }

    const ids = claimCommentHighlights()
    if (ids.length > 0) {
      setHighlightedComments((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }

    void clearCommentNotifications()
  }, [activeTab, claimCommentHighlights, clearCommentNotifications, commentHighlightVersion, highlightedComments, readOnly])

  if (!profile) return null

  const handleSendMessage = async () => {
    if (!user || !profileData) return

    setSendingMessage(true)
    try {
      const { data: existingConv, error: fetchError } = await supabase
        .from('conversations')
        .select('id')
        .or(
          `and(participant_one_id.eq.${user.id},participant_two_id.eq.${profileData.id}),and(participant_one_id.eq.${profileData.id},participant_two_id.eq.${user.id})`
        )
        .maybeSingle()

      if (fetchError) throw fetchError

      if (existingConv?.id) {
        navigate(`/messages?conversation=${existingConv.id}`)
        return
      }

      const { data: newConv, error: insertError } = await supabase
        .from('conversations')
        .insert({
          participant_one_id: user.id,
          participant_two_id: profileData.id
        })
        .select('id')
        .single()

      if (insertError) {
        if (isUniqueViolationError(insertError)) {
          const { data: refetchedConv, error: refetchError } = await supabase
            .from('conversations')
            .select('id')
            .or(
              `and(participant_one_id.eq.${user.id},participant_two_id.eq.${profileData.id}),and(participant_one_id.eq.${profileData.id},participant_two_id.eq.${user.id})`
            )
            .maybeSingle()

          if (refetchError) throw refetchError
          if (refetchedConv?.id) {
            navigate(`/messages?conversation=${refetchedConv.id}`)
            return
          }
        }

        throw insertError
      }

      if (!newConv?.id) {
        throw new Error('Conversation insert returned no data')
      }

      navigate(`/messages?conversation=${newConv.id}`)
    } catch (error) {
      console.error('Error creating conversation:', error)
      addToast('Failed to start conversation. Please try again.', 'error')
    } finally {
      setSendingMessage(false)
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'journey', label: 'Journey' },
    { id: 'friends', label: 'Friends' },
    { id: 'comments', label: 'Comments' },
  ]

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

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
              <Avatar
                src={profile.avatar_url}
                alt={profile.full_name ?? undefined}
                initials={getInitials(profile.full_name)}
                size="xl"
                enablePreview
                previewTitle={profile.full_name ?? undefined}
              />
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">
                    {profile.full_name}
                  </h1>
                  <div className="mb-3">
                    <RoleBadge role="coach" />
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
                  <div className="flex flex-wrap items-center gap-2">
                    <FriendshipButton profileId={profile.id} />
                    <button
                      onClick={handleSendMessage}
                      disabled={sendingMessage}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {sendingMessage ? 'Loading...' : 'Send Message'}
                    </button>
                  </div>
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
            <ScrollableTabs
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={handleTabChange}
              className="gap-8 px-6"
              activeClassName="border-[#6366f1] text-[#6366f1]"
              inactiveClassName="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            />
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
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Passports & Eligibility</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Passport 1</label>
                      <p className={profile.passport_1 ? 'text-gray-900' : 'text-gray-500 italic'}>
                        {profile.passport_1 || 'Not specified'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Passport 2</label>
                      <p className={profile.passport_2 ? 'text-gray-900' : 'text-gray-500 italic'}>
                        {profile.passport_2 || 'Not specified'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                    {profile.contact_email ? (
                      <a href={`mailto:${profile.contact_email}`} className="text-[#6366f1] hover:underline">
                        {profile.contact_email}
                      </a>
                    ) : (
                      <p className="text-gray-500 italic">Not specified</p>
                    )}
                  </div>
                </div>

                <section className="space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="text-2xl font-bold text-gray-900">About</h3>
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
                          <p>Use the edit option to share your coaching background, philosophy, and achievements.</p>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <section className="space-y-3 pt-6 border-t border-gray-200">
                  <MediaTab
                    profileId={profile.id}
                    readOnly={readOnly}
                    renderHeader={({ canManageVideo, openManageModal }) => (
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-2xl font-bold text-gray-900">Highlight Video</h2>
                        {canManageVideo && (
                          <Button variant="outline" size="sm" onClick={openManageModal}>
                            Manage
                          </Button>
                        )}
                      </div>
                    )}
                  />
                </section>
              </div>
            )}

            {/* Journey Tab */}
            {activeTab === 'journey' && (
              <div className="animate-fade-in">
                <JourneyTab profileId={profile.id} readOnly={readOnly} />
              </div>
            )}

            {activeTab === 'friends' && (
              <div className="animate-fade-in">
                <FriendsTab profileId={profile.id} readOnly={readOnly} />
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="animate-fade-in">
                <CommentsTab profileId={profile.id} highlightedCommentIds={highlightedComments} />
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
