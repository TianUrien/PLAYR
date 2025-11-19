import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { Plus, Edit2, Copy, Archive, MapPin, Calendar, Users, Eye, Rocket, Trash2, Loader2, MoreHorizontal } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/auth'
import { useToastStore } from '@/lib/toast'
import type { Vacancy } from '../lib/supabase'
import Button from './Button'
import CreateVacancyModal from './CreateVacancyModal'
import ApplyToVacancyModal from './ApplyToVacancyModal'
import VacancyDetailView from './VacancyDetailView'
import PublishConfirmationModal from './PublishConfirmationModal'
import DeleteVacancyModal from './DeleteVacancyModal'
import Skeleton, { VacancyCardSkeleton } from './Skeleton'

type VacancyWithCount = Vacancy & { applicant_count: number | null }

interface VacanciesTabProps {
  profileId?: string
  readOnly?: boolean
  triggerCreate?: boolean
  onCreateTriggered?: () => void
}

interface VacancyActionMenuProps {
  vacancy: Vacancy
  disabled?: boolean
  onEdit: (vacancy: Vacancy) => void
  onDuplicate: (vacancy: Vacancy) => void
  onPublish: (vacancy: Vacancy) => void
  onClose: (id: string) => void
  onDelete: (vacancy: Vacancy) => void
}

function VacancyActionMenu({ vacancy, disabled, onEdit, onDuplicate, onPublish, onClose, onDelete }: VacancyActionMenuProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleClick = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }
      setOpen(false)
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('touchstart', handleClick)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('touchstart', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const closeMenu = () => setOpen(false)

  const menuItems: Array<{ key: string; label: string; icon: ReactNode; onClick: () => void; tone?: 'danger' | 'primary' }> = []

  if (vacancy.status === 'draft') {
    menuItems.push({
      key: 'publish',
      label: 'Publish vacancy',
      icon: <Rocket className="w-4 h-4 text-green-600" />,
      onClick: () => {
        closeMenu()
        onPublish(vacancy)
      },
      tone: 'primary'
    })
  }

  if (vacancy.status === 'open') {
    menuItems.push({
      key: 'close',
      label: 'Close opportunity',
      icon: <Archive className="w-4 h-4 text-amber-600" />,
      onClick: () => {
        closeMenu()
        onClose(vacancy.id)
      },
      tone: 'danger'
    })
  }

  menuItems.push(
    {
      key: 'edit',
      label: 'Edit details',
      icon: <Edit2 className="w-4 h-4" />,
      onClick: () => {
        closeMenu()
        onEdit(vacancy)
      }
    },
    {
      key: 'duplicate',
      label: 'Duplicate',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => {
        closeMenu()
        onDuplicate(vacancy)
      }
    }
  )

  if (vacancy.status === 'closed') {
    menuItems.push({
      key: 'delete',
      label: 'Delete permanently',
      icon: <Trash2 className="w-4 h-4 text-red-600" />,
      onClick: () => {
        closeMenu()
        onDelete(vacancy)
      },
      tone: 'danger'
    })
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Open vacancy menu"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:text-gray-900 disabled:opacity-50"
      >
        <MoreHorizontal className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg ring-1 ring-black/5">
          {menuItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-left transition hover:bg-gray-50 ${
                item.tone === 'danger'
                  ? 'text-red-600'
                  : item.tone === 'primary'
                  ? 'text-green-600'
                  : 'text-gray-700'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function VacanciesTab({ profileId, readOnly = false, triggerCreate, onCreateTriggered }: VacanciesTabProps) {
  const { user, profile } = useAuthStore()
  const targetUserId = profileId || user?.id
  const navigate = useNavigate()
  const { addToast } = useToastStore()
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({})
  const [userApplications, setUserApplications] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingVacancy, setEditingVacancy] = useState<Vacancy | null>(null)
  type VacancyAction = 'publish' | 'close' | 'delete' | 'duplicate'
  const [actionLoading, setActionLoading] = useState<{ id: string; action: VacancyAction } | null>(null)
  
  // Apply modal state
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null)
  
  // Detail modal state
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailVacancy, setDetailVacancy] = useState<Vacancy | null>(null)
  const [clubName, setClubName] = useState<string>('')
  const [clubLogo, setClubLogo] = useState<string | null>(null)
  
  // Publish confirmation modal state
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [vacancyToPublish, setVacancyToPublish] = useState<Vacancy | null>(null)
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [vacancyToDelete, setVacancyToDelete] = useState<Vacancy | null>(null)

  const fetchVacancies = useCallback(async () => {
    if (!targetUserId) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .rpc('fetch_club_vacancies_with_counts', {
          p_club_id: targetUserId,
          p_include_closed: !readOnly,
          p_limit: 200
        })
        .returns<VacancyWithCount[]>()

      if (error) throw error

      const normalized = (data ?? []).map((row) => {
        const { applicant_count, ...vacancyFields } = row
        return {
          vacancy: vacancyFields as Vacancy,
          applicantCount: applicant_count ?? 0
        }
      })

      setVacancies(normalized.map((entry) => entry.vacancy))

      if (!readOnly && user?.id === targetUserId) {
        const counts: Record<string, number> = {}
        normalized.forEach((entry) => {
          counts[entry.vacancy.id] = entry.applicantCount
        })
        setApplicantCounts(counts)
      } else {
        setApplicantCounts({})
      }
    } catch (error) {
      console.error('Error fetching vacancies:', error)
    } finally {
      setIsLoading(false)
    }
  }, [targetUserId, readOnly, user])

  // Fetch user's applications to check which vacancies they've applied to
  const fetchUserApplications = useCallback(async () => {
    if (!user || !readOnly) return // Only fetch when in readOnly mode (public view)

    try {
      const { data, error } = await supabase
        .from('vacancy_applications')
        .select('vacancy_id')
        .eq('player_id', user.id)

      if (error) throw error
      
      const appliedVacancyIds = new Set(data?.map(app => app.vacancy_id) || [])
      setUserApplications(appliedVacancyIds)
    } catch (error) {
      console.error('Error fetching user applications:', error)
    }
  }, [user, readOnly])

  useEffect(() => {
    if (targetUserId) {
      fetchVacancies()
      fetchUserApplications()
    }
  }, [targetUserId, fetchVacancies, fetchUserApplications])

  // Handle external trigger to create vacancy
  useEffect(() => {
    if (triggerCreate) {
      setShowModal(true)
      setEditingVacancy(null)
      onCreateTriggered?.()
    }
  }, [triggerCreate, onCreateTriggered])

  const handleApply = (vacancy: Vacancy) => {
    if (!user) {
      // Redirect to login with return URL
      const returnUrl = window.location.pathname
      navigate(`/signup?redirect=${encodeURIComponent(returnUrl)}`)
      return
    }

    setSelectedVacancy(vacancy)
    setShowApplyModal(true)
  }

  const canUserApply = (vacancy: Vacancy): boolean => {
    if (!user || !profile) return false
    
    // Check if user role matches vacancy type
    if (vacancy.opportunity_type === 'player' && profile.role !== 'player') return false
    if (vacancy.opportunity_type === 'coach' && profile.role !== 'coach') return false
    
    // Clubs cannot apply
    if (profile.role === 'club') return false
    
    return true
  }

  const handleViewDetails = async (vacancy: Vacancy) => {
    setDetailVacancy(vacancy)
    setShowDetailModal(true)

    // Fetch club details
    try {
      const { data: clubData } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', vacancy.club_id)
        .single()

      if (clubData) {
        setClubName(clubData.full_name || 'Unknown Club')
        setClubLogo(clubData.avatar_url)
      }
    } catch (error) {
      console.error('Error fetching club details:', error)
      setClubName('Unknown Club')
    }
  }

  const handleCreateNew = () => {
    setEditingVacancy(null)
    setShowModal(true)
  }

  const handleEdit = (vacancy: Vacancy) => {
    setEditingVacancy(vacancy)
    setShowModal(true)
  }

  const handleDuplicate = async (vacancy: Vacancy) => {
    if (!user || actionLoading) return

    setActionLoading({ id: vacancy.id, action: 'duplicate' })
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, created_at, updated_at, published_at, closed_at, ...duplicateData } = vacancy
      
      const newVacancy = {
        ...duplicateData,
        title: `${vacancy.title} (Copy)`,
        status: 'draft' as const,
      }

      const { error } = await supabase
        .from('vacancies')
        .insert(newVacancy as never)

      if (error) throw error
      
      await fetchVacancies()
      addToast('Vacancy duplicated as draft.', 'success')
    } catch (error) {
      console.error('Error duplicating vacancy:', error)
      addToast('Failed to duplicate vacancy. Please try again.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleClose = async (vacancyId: string) => {
    if (actionLoading) return
    
    setActionLoading({ id: vacancyId, action: 'close' })
    try {
      const { error } = await supabase
        .from('vacancies')
        .update({ status: 'closed' } as never)
        .eq('id', vacancyId)

      if (error) throw error
      
      await fetchVacancies()
      addToast('Vacancy closed.', 'success')
    } catch (error) {
      console.error('Error closing vacancy:', error)
      addToast('Failed to close vacancy. Please try again.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handlePublishClick = (vacancy: Vacancy) => {
    setVacancyToPublish(vacancy)
    setShowPublishModal(true)
  }

  const handlePublish = async () => {
  if (actionLoading || !vacancyToPublish) return
    
  setActionLoading({ id: vacancyToPublish.id, action: 'publish' })
    try {
      const { error } = await supabase
        .from('vacancies')
        .update({ status: 'open', published_at: new Date().toISOString() } as never)
        .eq('id', vacancyToPublish.id)

      if (error) throw error
      
      await fetchVacancies()
      
      // Close modal and show success toast
      setShowPublishModal(false)
      setVacancyToPublish(null)
      addToast('Vacancy published successfully!', 'success')
    } catch (error) {
      console.error('Error publishing vacancy:', error)
      addToast('Failed to publish vacancy. Please try again.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteClick = (vacancy: Vacancy) => {
    setVacancyToDelete(vacancy)
    setShowDeleteModal(true)
  }

  const handleDelete = async () => {
  if (actionLoading || !vacancyToDelete) return
    
  setActionLoading({ id: vacancyToDelete.id, action: 'delete' })
    try {
      // Delete the vacancy (cascade will handle applications)
      const { error } = await supabase
        .from('vacancies')
        .delete()
        .eq('id', vacancyToDelete.id)

      if (error) throw error
      
      // Refresh vacancies list
      await fetchVacancies()
      
      // Close modal
      setShowDeleteModal(false)
      setVacancyToDelete(null)
      addToast('Vacancy deleted.', 'success')
    } catch (error) {
      console.error('Error deleting vacancy:', error)
      addToast('Failed to delete vacancy. Please try again.', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: Vacancy['status']) => {
    if (!status) return null
    
    const styles: Record<string, string> = {
      draft: 'bg-amber-100 text-amber-700 border border-amber-300',
      open: 'bg-green-100 text-green-700 border border-green-300',
      closed: 'bg-red-100 text-red-700 border border-red-300',
    }
    
    const labels: Record<string, string> = {
      draft: '⚠️ Draft',
      open: '✓ Published',
      closed: 'Closed',
    }
    
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${styles[status]}`}>
        {labels[status]}
      </span>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBD'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white/80 px-4 py-4">
          <div className="space-y-2">
            <Skeleton width={120} height={16} />
            <Skeleton width={200} height={28} />
            <Skeleton width={160} height={14} />
          </div>
          {!readOnly && <Skeleton width={90} height={36} className="rounded-full" />}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <VacancyCardSkeleton key={index} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white/80 px-4 py-4 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Vacancies</p>
          <h2 className="text-2xl font-bold text-gray-900">
            {readOnly ? 'Open opportunities' : 'Manage openings'}
          </h2>
          <p className="text-sm text-gray-500">
            {readOnly
              ? `${vacancies.length} live role${vacancies.length === 1 ? '' : 's'}`
              : `${vacancies.length} total vacanc${vacancies.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={handleCreateNew}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-white"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        )}
      </div>

      {/* Empty State */}
      {vacancies.length === 0 && !readOnly && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <span className="text-3xl">💼</span>
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">No Vacancies Yet</h3>
          <p className="mb-6 text-gray-600">
            Create your first vacancy to start attracting talent to your club
          </p>
          <Button
            onClick={handleCreateNew}
            className="mx-auto flex items-center gap-2 bg-[#10b981] hover:bg-[#059669]"
          >
            <Plus className="h-4 w-4" />
            Create First Vacancy
          </Button>
        </div>
      )}

      {vacancies.length === 0 && readOnly && (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <span className="text-2xl">👀</span>
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-gray-900">No Open Opportunities</h3>
          <p className="text-sm text-gray-600">
            This club hasn’t posted any openings yet. Check back soon or follow them to stay updated.
          </p>
        </div>
      )}

      {/* Vacancies Grid */}
      {vacancies.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {vacancies.map((vacancy) => {
            const positionLabel = vacancy.position ? vacancy.position.charAt(0).toUpperCase() + vacancy.position.slice(1) : null
            const genderLabel = vacancy.gender ? vacancy.gender.charAt(0).toUpperCase() + vacancy.gender.slice(1) : null
            const locationLabel = [vacancy.location_city, vacancy.location_country].filter(Boolean).join(', ')
            const details = [positionLabel, genderLabel, locationLabel].filter(Boolean).join(' • ')

            return (
              <div
                key={vacancy.id}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,0.08)] active:scale-[0.99]"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-wide text-gray-500">{vacancy.opportunity_type === 'player' ? 'Player role' : 'Coach role'}</p>
                    <h3 className="text-lg font-semibold text-gray-900">{vacancy.title}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(vacancy.status)}
                    {!readOnly && (
                      <VacancyActionMenu
                        vacancy={vacancy}
                        disabled={Boolean(actionLoading)}
                        onEdit={handleEdit}
                        onDuplicate={handleDuplicate}
                        onPublish={handlePublishClick}
                        onClose={handleClose}
                        onDelete={handleDeleteClick}
                      />
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-3">
                  {details && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{details}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span>{locationLabel || 'Location TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span>Start {formatDate(vacancy.start_date)}</span>
                  </div>
                </div>

                {/* Applicants pill */}
                {!readOnly && (vacancy.status === 'open' || vacancy.status === 'closed') && (
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/club/vacancies/${vacancy.id}/applicants`)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300"
                  >
                    <Users className="w-4 h-4" />
                    {applicantCounts[vacancy.id] || 0} applicant{applicantCounts[vacancy.id] === 1 ? '' : 's'}
                  </button>
                )}

                {/* Draft hint */}
                {!readOnly && vacancy.status === 'draft' && (
                  <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                    Draft only — publish when you’re ready to go live.
                  </p>
                )}

                {/* Public actions */}
                {readOnly && (
                  <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                    {!user ? (
                      <button
                        type="button"
                        onClick={() => handleApply(vacancy)}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30"
                      >
                        Sign in to apply
                      </button>
                    ) : userApplications.has(vacancy.id) ? (
                      <button
                        type="button"
                        disabled
                        className="flex-1 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
                      >
                        ✓ Applied
                      </button>
                    ) : canUserApply(vacancy) ? (
                      <button
                        type="button"
                        onClick={() => handleApply(vacancy)}
                        className="flex-1 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/30"
                      >
                        Apply now
                      </button>
                    ) : (
                      <div className="flex-1 rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-center text-xs font-medium text-gray-500">
                        {vacancy.opportunity_type === 'player'
                          ? 'Players only'
                          : 'Coaches only'}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => handleViewDetails(vacancy)}
                      className="rounded-2xl border border-gray-200 p-3 text-gray-500 transition hover:bg-gray-50"
                      aria-label="View vacancy details"
                    >
                      <Eye className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Loading indicators for menu-triggered actions */}
                {!readOnly && actionLoading?.id === vacancy.id && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {actionLoading.action === 'publish' && 'Publishing opportunity...'}
                    {actionLoading.action === 'close' && 'Closing opportunity...'}
                    {actionLoading.action === 'delete' && 'Deleting opportunity...'}
                    {actionLoading.action === 'duplicate' && 'Duplicating opportunity...'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <CreateVacancyModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false)
          setEditingVacancy(null)
        }}
        onSuccess={fetchVacancies}
        editingVacancy={editingVacancy}
      />

      {/* Apply Modal */}
      {selectedVacancy && (
        <ApplyToVacancyModal
          isOpen={showApplyModal}
          onClose={() => {
            setShowApplyModal(false)
            setSelectedVacancy(null)
          }}
          vacancy={selectedVacancy}
          onSuccess={(vacancyId) => {
            setUserApplications(prev => new Set([...prev, vacancyId]))
          }}
          onError={(vacancyId) => {
            setUserApplications(prev => {
              const next = new Set(prev)
              next.delete(vacancyId)
              return next
            })
          }}
        />
      )}

      {/* Vacancy Detail Modal */}
      {detailVacancy && showDetailModal && (
        <VacancyDetailView
          vacancy={detailVacancy}
          clubName={clubName}
          clubLogo={clubLogo}
          clubId={detailVacancy.club_id}
          onClose={() => {
            setShowDetailModal(false)
            setDetailVacancy(null)
          }}
          onApply={
            user && (profile?.role === 'player' || profile?.role === 'coach') && canUserApply(detailVacancy)
              ? () => {
                  setShowDetailModal(false)
                  setSelectedVacancy(detailVacancy)
                  setShowApplyModal(true)
                }
              : undefined
          }
          hasApplied={userApplications.has(detailVacancy.id)}
          hideClubProfileButton={true}
        />
      )}

      {/* Publish Confirmation Modal */}
      {vacancyToPublish && (
        <PublishConfirmationModal
          isOpen={showPublishModal}
          onClose={() => {
            setShowPublishModal(false)
            setVacancyToPublish(null)
          }}
          onConfirm={handlePublish}
          vacancyTitle={vacancyToPublish.title}
          isLoading={actionLoading?.id === vacancyToPublish.id && actionLoading.action === 'publish'}
        />
      )}

      {/* Delete Confirmation Modal */}
      {vacancyToDelete && (
        <DeleteVacancyModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setVacancyToDelete(null)
          }}
          onConfirm={handleDelete}
          vacancyTitle={vacancyToDelete.title}
          isLoading={actionLoading?.id === vacancyToDelete.id && actionLoading.action === 'delete'}
        />
      )}
    </div>
  )
}
