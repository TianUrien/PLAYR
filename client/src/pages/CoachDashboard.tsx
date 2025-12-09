import { useEffect, useState, useRef } from 'react'
import { MapPin, Calendar, Edit2, Eye, MessageCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { Avatar, DashboardMenu, EditProfileModal, JourneyTab, CommentsTab, FriendsTab, FriendshipButton, ProfileStrengthCard, PublicReferencesSection, PublicViewBanner, RoleBadge, ScrollableTabs, DualNationalityDisplay, CountryDisplay } from '@/components'
import Header from '@/components/Header'
import MediaTab from '@/components/MediaTab'
import Button from '@/components/Button'
import SocialLinksDisplay from '@/components/SocialLinksDisplay'
import type { Profile } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { isUniqueViolationError } from '@/lib/supabaseErrors'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToastStore } from '@/lib/toast'
import { useNotificationStore } from '@/lib/notifications'
import { derivePublicContactEmail } from '@/lib/profile'
import type { SocialLinks } from '@/lib/socialLinks'
import { useCoachProfileStrength } from '@/hooks/useCoachProfileStrength'

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
    | 'nationality_country_id'
    | 'nationality2_country_id'
    | 'gender'
    | 'date_of_birth'
    | 'email'
    | 'contact_email'
    | 'contact_email_public'
    | 'passport_1'
    | 'passport_2'
    | 'passport1_country_id'
    | 'passport2_country_id'
  >

interface CoachDashboardProps {
  profileData?: CoachProfileShape
  readOnly?: boolean
  /** When true and readOnly is true, shows a banner indicating user is viewing their own public profile */
  isOwnProfile?: boolean
}

export default function CoachDashboard({ profileData, readOnly = false, isOwnProfile = false }: CoachDashboardProps) {
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

  // Profile strength for coaches (only compute for own profile)
  // Must be called before any early returns to satisfy React hooks rules
  const { percentage, buckets, loading: strengthLoading, refresh: refreshStrength } = useCoachProfileStrength({
    profile: readOnly ? null : (profileData ?? authProfile) as CoachProfileShape | null,
  })

  // Track previous percentage to show toast on improvement
  const prevPercentageRef = useRef<number | null>(null)

  useEffect(() => {
    if (!tabParam) return
    if (tabParam !== activeTab && ['profile', 'journey', 'friends', 'comments'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam, activeTab])

  // Refresh profile strength when switching to profile tab (to pick up gallery/journey changes)
  useEffect(() => {
    if (!readOnly && activeTab === 'profile') {
      void refreshStrength()
    }
  }, [activeTab, readOnly, refreshStrength])

  // Show toast when profile strength improves
  useEffect(() => {
    if (readOnly || strengthLoading) return
    if (prevPercentageRef.current !== null && percentage > prevPercentageRef.current) {
      addToast({
        type: 'success',
        message: `Profile strength: ${percentage}%`,
      })
    }
    prevPercentageRef.current = percentage
  }, [percentage, readOnly, strengthLoading, addToast])

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

  const publicContact = derivePublicContactEmail(profile)
  const savedContactEmail = profile.contact_email?.trim() || ''

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
      
      {/* Public View Banner - shown when user views their own profile in public mode */}
      {readOnly && isOwnProfile && <PublicViewBanner />}

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
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <RoleBadge role="coach" />
                    <SocialLinksDisplay 
                      links={profile.social_links as SocialLinks | null | undefined} 
                      iconSize="sm" 
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                {!readOnly ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => navigate(`/players/id/${profile.id}`)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                    >
                      <Eye className="w-4 h-4" />
                      Public View
                    </button>
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit Profile
                    </button>
                    <DashboardMenu />
                  </div>
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
                  <DualNationalityDisplay
                    primaryCountryId={profile.nationality_country_id}
                    secondaryCountryId={profile.nationality2_country_id}
                    passport1CountryId={profile.passport1_country_id}
                    passport2CountryId={profile.passport2_country_id}
                    fallbackText={profile.nationality}
                    mode="compact"
                  />
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
                {/* Profile Strength Card - only for own profile */}
                {!readOnly && (
                  <ProfileStrengthCard
                    percentage={percentage}
                    buckets={buckets}
                    loading={strengthLoading}
                    onBucketAction={(actionId) => {
                      if (actionId === 'edit-profile') {
                        setShowEditModal(true)
                      } else if (actionId === 'journey-tab') {
                        setActiveTab('journey')
                        setSearchParams({ tab: 'journey' })
                      } else if (actionId === 'gallery-tab') {
                        // Scroll to MediaTab section within profile tab
                        const mediaSection = document.querySelector('[data-section="media"]')
                        if (mediaSection) {
                          mediaSection.scrollIntoView({ behavior: 'smooth' })
                        }
                      }
                    }}
                  />
                )}

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
                      <DualNationalityDisplay
                        primaryCountryId={profile.nationality_country_id}
                        secondaryCountryId={profile.nationality2_country_id}
                        passport1CountryId={profile.passport1_country_id}
                        passport2CountryId={profile.passport2_country_id}
                        fallbackText={profile.nationality}
                        mode="full"
                        className="text-gray-900"
                      />
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

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Passports & Eligibility</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Passport 1</label>
                      {profile.passport1_country_id || profile.passport_1 ? (
                        <CountryDisplay
                          countryId={profile.passport1_country_id}
                          fallbackText={profile.passport_1}
                          className="text-gray-900"
                        />
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Passport 2</label>
                      {profile.passport2_country_id || profile.passport_2 ? (
                        <CountryDisplay
                          countryId={profile.passport2_country_id}
                          fallbackText={profile.passport_2}
                          className="text-gray-900"
                        />
                      ) : (
                        <p className="text-gray-500 italic">Not specified</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                      {publicContact.shouldShow && publicContact.displayEmail ? (
                        <a href={`mailto:${publicContact.displayEmail}`} className="text-[#6366f1] hover:underline">
                          {publicContact.displayEmail}
                        </a>
                      ) : (
                        <p className="text-gray-500 italic">Not shown publicly</p>
                      )}
                      {!readOnly && (
                        <p className="text-xs text-gray-500 mt-1">
                          {profile.contact_email_public
                            ? publicContact.source === 'contact'
                              ? 'Public viewers see this contact email.'
                              : 'Public viewers see your account email.'
                            : savedContactEmail
                              ? 'Saved contact email is private.'
                              : 'No contact email saved; only private channels apply.'}
                        </p>
                      )}
                      {!readOnly && !profile.contact_email_public && savedContactEmail && (
                        <p className="text-xs text-gray-500 break-words">
                          Private contact email: <span className="text-gray-700 font-medium">{savedContactEmail}</span>
                        </p>
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

                {readOnly && (
                  <PublicReferencesSection profileId={profile.id} profileName={profile.full_name} />
                )}

                <section data-section="media" className="space-y-3 pt-6 border-t border-gray-200">
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
                <FriendsTab profileId={profile.id} readOnly={readOnly} profileRole={profile.role} />
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
