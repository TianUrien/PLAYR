import { useState, useEffect, useCallback, type ComponentType } from 'react'
import {
  Building2,
  Calendar,
  Clock,
  Edit2,
  Flag,
  Globe2,
  GraduationCap,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  X,
} from 'lucide-react'
import { differenceInMonths, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import type { PlayingHistory } from '@/lib/supabase'
import Button from './Button'
import Skeleton from './Skeleton'

type EditableJourneyEntry = PlayingHistory & {
  highlights: string[]
  start_date: string | null
  end_date: string | null
  startMonthDraft?: string
  startYearDraft?: string
  endMonthDraft?: string
  endYearDraft?: string
}

type JourneyType = PlayingHistory['entry_type']

type EntryTypeMeta = {
  label: string
  dotClass: string
  badgeClass: string
  icon: ComponentType<{ className?: string }>
}

const entryTypeMeta: Record<JourneyType, EntryTypeMeta> = {
  club: {
    label: 'Club',
    dotClass: 'bg-blue-500/95 text-white',
    badgeClass: 'bg-blue-50 text-blue-700',
    icon: Building2,
  },
  national_team: {
    label: 'National',
    dotClass: 'bg-emerald-500/95 text-white',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    icon: Globe2,
  },
  achievement: {
    label: 'Achievement',
    dotClass: 'bg-amber-500/95 text-white',
    badgeClass: 'bg-amber-50 text-amber-700',
    icon: Trophy,
  },
  tournament: {
    label: 'Tournament',
    dotClass: 'bg-indigo-500/95 text-white',
    badgeClass: 'bg-indigo-50 text-indigo-700',
    icon: Flag,
  },
  milestone: {
    label: 'Milestone',
    dotClass: 'bg-pink-500/95 text-white',
    badgeClass: 'bg-pink-50 text-pink-700',
    icon: Star,
  },
  academy: {
    label: 'Academy',
    dotClass: 'bg-sky-500/95 text-white',
    badgeClass: 'bg-sky-50 text-sky-700',
    icon: GraduationCap,
  },
  other: {
    label: 'Journey',
    dotClass: 'bg-slate-500/95 text-white',
    badgeClass: 'bg-gray-100 text-gray-700',
    icon: Sparkles,
  },
}

const ENTRY_TYPES: { id: JourneyType; label: string }[] = (
  Object.keys(entryTypeMeta) as JourneyType[]
).map(id => ({ id, label: entryTypeMeta[id].label }))

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ label, value: String(index) }))

const CURRENT_YEAR = new Date().getUTCFullYear()
const YEAR_OPTIONS = Array.from({ length: 70 }, (_, index) => CURRENT_YEAR + 5 - index).map(year => String(year))

interface JourneyTabProps {
  profileId?: string
  readOnly?: boolean
}

export default function JourneyTab({ profileId, readOnly = false }: JourneyTabProps) {
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const targetUserId = profileId || user?.id

  const [journey, setJourney] = useState<EditableJourneyEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedEntries, setEditedEntries] = useState<EditableJourneyEntry[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const normalizeDate = (value: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.valueOf())) return null
    return parsed.toISOString().split('T')[0]
  }

  const seedDrafts = (dateValue: string | null) => {
    if (!dateValue) return { month: '', year: '' }
    const parsed = new Date(dateValue)
    if (Number.isNaN(parsed.valueOf())) return { month: '', year: '' }
    return {
      month: String(parsed.getUTCMonth()),
      year: String(parsed.getUTCFullYear()),
    }
  }

  const fetchJourney = useCallback(async () => {
    if (!targetUserId) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('playing_history')
        .select('*')
        .eq('user_id', targetUserId)
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('display_order', { ascending: false })

      if (error) throw error

      const normalized = (data || []).map(entry => {
        const start = normalizeDate(entry.start_date)
        const end = normalizeDate(entry.end_date)
        const startDraft = seedDrafts(start)
        const endDraft = seedDrafts(end)

        return {
          ...entry,
          highlights: entry.highlights ?? [],
          start_date: start,
          end_date: end,
          startMonthDraft: startDraft.month,
          startYearDraft: startDraft.year,
          endMonthDraft: endDraft.month,
          endYearDraft: endDraft.year,
        }
      })

      setJourney(normalized)
    } catch (error) {
      console.error('Error fetching journey entries:', error)
      addToast('Failed to load Journey timeline.', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [targetUserId, addToast])

  useEffect(() => {
    if (targetUserId) {
      fetchJourney()
    }
  }, [targetUserId, fetchJourney])

  const beginEditing = () => {
    setEditedEntries(journey.map(entry => ({
      ...entry,
      highlights: [...(entry.highlights ?? [])],
      startMonthDraft: entry.startMonthDraft ?? '',
      startYearDraft: entry.startYearDraft ?? '',
      endMonthDraft: entry.endMonthDraft ?? '',
      endYearDraft: entry.endYearDraft ?? '',
    })))
    setIsEditing(true)
    setErrors({})
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedEntries([])
    setErrors({})
  }

  const handleAddEntry = () => {
    setEditedEntries(prev => [
      {
        id: `temp-${Date.now()}`,
        user_id: user?.id || '',
        club_name: '',
        position_role: '',
        years: '',
        division_league: '',
        highlights: [],
        entry_type: 'club',
        location_city: '',
        location_country: '',
        start_date: null,
        end_date: null,
        description: '',
        badge_label: '',
        image_url: '',
        display_order: prev.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        startMonthDraft: '',
        startYearDraft: '',
        endMonthDraft: '',
        endYearDraft: '',
      },
      ...prev,
    ])
  }

  const removeEntry = (index: number) => {
    setEditedEntries(prev => prev.filter((_, idx) => idx !== index))
  }

  const updateField = <K extends keyof EditableJourneyEntry>(
    index: number,
    field: K,
    value: EditableJourneyEntry[K]
  ) => {
    setEditedEntries(prev =>
      prev.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
    )

    const errorKey = `${index}-${String(field)}`
    if (errors[errorKey]) {
      const nextErrors = { ...errors }
      delete nextErrors[errorKey]
      setErrors(nextErrors)
    }
  }

  const updateDraftDate = (
    index: number,
    kind: 'start' | 'end',
    part: 'month' | 'year',
    value: string
  ) => {
    setEditedEntries(prev =>
      prev.map((entry, idx) => {
        if (idx !== index) return entry

        const monthKey = kind === 'start' ? 'startMonthDraft' : 'endMonthDraft'
        const yearKey = kind === 'start' ? 'startYearDraft' : 'endYearDraft'
        const dateKey = kind === 'start' ? 'start_date' : 'end_date'

        const updatedEntry: EditableJourneyEntry = {
          ...entry,
          [monthKey]: part === 'month' ? value : entry[monthKey],
          [yearKey]: part === 'year' ? value : entry[yearKey],
        }

        const month = updatedEntry[monthKey]
        const year = updatedEntry[yearKey]

        if (month && year) {
          const iso = new Date(Date.UTC(Number(year), Number(month), 1))
            .toISOString()
            .split('T')[0]
          return { ...updatedEntry, [dateKey]: iso }
        }

        return { ...updatedEntry, [dateKey]: null }
      })
    )

    if (kind === 'start' && errors[`${index}-start_date`]) {
      const nextErrors = { ...errors }
      delete nextErrors[`${index}-start_date`]
      setErrors(nextErrors)
    }
  }

  const handleHighlightChange = (entryIndex: number, highlightIndex: number, text: string) => {
    setEditedEntries(prev =>
      prev.map((entry, idx) => {
        if (idx !== entryIndex) return entry
        const highlights = [...entry.highlights]
        highlights[highlightIndex] = text
        return { ...entry, highlights }
      })
    )
  }

  const removeHighlight = (entryIndex: number, highlightIndex: number) => {
    setEditedEntries(prev =>
      prev.map((entry, idx) =>
        idx === entryIndex
          ? { ...entry, highlights: entry.highlights.filter((_, i) => i !== highlightIndex) }
          : entry
      )
    )
  }

  const validate = () => {
    const nextErrors: Record<string, string> = {}
    let valid = true

    editedEntries.forEach((entry, index) => {
      if (!entry.club_name.trim()) {
        nextErrors[`${index}-club_name`] = 'Title is required'
        valid = false
      }
      if (!entry.position_role.trim()) {
        nextErrors[`${index}-position_role`] = 'Role is required'
        valid = false
      }
      if (!entry.division_league.trim()) {
        nextErrors[`${index}-division_league`] = 'Competition is required'
        valid = false
      }
      if (!entry.start_date) {
        nextErrors[`${index}-start_date`] = 'Start month and year are required'
        valid = false
      }
    })

    setErrors(nextErrors)
    return valid
  }

  const handleSave = async () => {
    if (!user || !validate()) return

    setSaving(true)
    try {
      const deletedIds = journey
        .filter(entry => !editedEntries.find(e => e.id === entry.id))
        .map(entry => entry.id)
        .filter(id => !id.startsWith('temp-'))

      if (deletedIds.length) {
        const { error: deleteError } = await supabase
          .from('playing_history')
          .delete()
          .in('id', deletedIds)
        if (deleteError) throw deleteError
      }

      const toPersist = editedEntries.map((entry, index) => {
        const startDate = entry.start_date
        const endDate = entry.end_date
        const yearsText = startDate
          ? `${format(new Date(startDate), 'MMM yyyy')} - ${endDate ? format(new Date(endDate), 'MMM yyyy') : 'Present'}`
          : entry.years

        return {
          id: entry.id,
          user_id: user.id,
          club_name: entry.club_name,
          position_role: entry.position_role,
          division_league: entry.division_league,
          years: yearsText || entry.years,
          highlights: entry.highlights.filter(highlight => highlight.trim() !== ''),
          entry_type: entry.entry_type,
          location_city: entry.location_city,
          location_country: entry.location_country,
          start_date: startDate,
          end_date: endDate,
          description: entry.description,
          badge_label: entry.badge_label,
          image_url: entry.image_url,
          display_order: editedEntries.length - index,
        }
      })

      for (const entry of toPersist) {
        if (entry.id.startsWith('temp-')) {
          const { error: insertError } = await supabase.from('playing_history').insert(entry)
          if (insertError) throw insertError
        } else {
          const { error: updateError } = await supabase
            .from('playing_history')
            .update(entry)
            .eq('id', entry.id)
          if (updateError) throw updateError
        }
      }

      await fetchJourney()
      setIsEditing(false)
      setEditedEntries([])
      addToast('Journey updated successfully.', 'success')
    } catch (error) {
      console.error('Error saving journey entries:', error)
      addToast('Failed to save journey. Please try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatMonthLabel = (value: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.valueOf())) return null
    return format(parsed, 'MMM yyyy')
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return null
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date()
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) return null
    const totalMonths = differenceInMonths(endDate, startDate)
    if (totalMonths < 0) return null
    const years = Math.floor(totalMonths / 12)
    const months = totalMonths % 12
    const parts: string[] = []
    if (years > 0) {
      parts.push(years > 1 ? `${years} years` : '1 year')
    }
    if (months > 0) {
      parts.push(`${months}m`)
    }
    return parts.length ? parts.join(' ') : 'Less than a month'
  }

  const renderTimeline = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="w-px flex-1 bg-gray-200" />
              </div>
              <div className="flex-1 space-y-4 rounded-2xl border border-gray-100 bg-white p-6">
                <Skeleton height={24} width="55%" />
                <Skeleton height={16} width="35%" />
                <Skeleton height={80} width="100%" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (journey.length === 0) {
      return (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Journey entries yet</h3>
          <p className="text-gray-600 mb-6">
            {readOnly
              ? 'This profile has not shared any Journey milestones yet.'
              : 'Capture your biggest milestones so clubs and coaches can understand your path.'}
          </p>
          {!readOnly && (
            <Button onClick={beginEditing} className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Journey Entry
            </Button>
          )}
        </div>
      )
    }

    const ordered = [...journey].sort((a, b) => {
      const aTime = a.start_date ? new Date(a.start_date).valueOf() : 0
      const bTime = b.start_date ? new Date(b.start_date).valueOf() : 0
      if (aTime === bTime) {
        return (b.display_order ?? 0) - (a.display_order ?? 0)
      }
      return bTime - aTime
    })

    return (
      <div className="relative pl-8">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-indigo-100 via-gray-200 to-transparent" />
        <div className="space-y-10">
          {ordered.map((entry, index) => {
            const meta = entryTypeMeta[entry.entry_type]
            const Icon = meta.icon
            const startLabel = formatMonthLabel(entry.start_date)
            const endLabel = entry.end_date ? formatMonthLabel(entry.end_date) : 'Present'
            const durationLabel = formatDuration(entry.start_date, entry.end_date)
            const location = [entry.location_city, entry.location_country]
              .filter(Boolean)
              .join(', ')

            return (
              <div key={entry.id} className="flex gap-6">
                <div className="flex flex-col items-center">
                  <div
                    className={`relative flex h-12 w-12 items-center justify-center rounded-full border-4 border-white shadow-lg ring-2 ring-indigo-50 ${meta.dotClass}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {index !== ordered.length - 1 && <div className="mt-2 w-px flex-1 bg-gray-200" />}
                </div>
                <div className="flex-1">
                  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex gap-4">
                        {entry.image_url ? (
                          <img
                            src={entry.image_url}
                            alt="Journey logo"
                            className="h-16 w-16 rounded-2xl object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500">
                            <ImageIcon className="h-6 w-6" />
                          </div>
                        )}
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-400">My Hockey Journey</p>
                          <h3 className="text-xl font-semibold text-gray-900">{entry.club_name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                            {location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {location}
                              </span>
                            )}
                            {(entry.position_role || entry.division_league) && <span className="text-gray-300">•</span>}
                            <span>{[entry.position_role, entry.division_league].filter(Boolean).join(' • ')}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                        {entry.badge_label?.trim() || meta.label}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                      {(startLabel || endLabel) && (
                        <div className="inline-flex items-center gap-2 text-gray-700">
                          <Calendar className="h-4 w-4" />
                          <span>
                            {startLabel || entry.years || 'Unknown'}
                            {startLabel && ' – '}
                            {startLabel ? endLabel : ''}
                          </span>
                        </div>
                      )}
                      {durationLabel && (
                        <div className="inline-flex items-center gap-2 text-gray-700">
                          <Clock className="h-4 w-4" />
                          <span>{durationLabel}</span>
                        </div>
                      )}
                    </div>

                    {entry.description?.trim() && (
                      <p className="mt-4 text-gray-700 leading-relaxed">{entry.description}</p>
                    )}

                    {entry.highlights.length > 0 && (
                      <ul className="mt-4 grid gap-2 text-gray-700">
                        {entry.highlights.map((highlight, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm" aria-label="Journey highlight">
                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-400" />
                            <span>{highlight}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderEditor = () => (
    <div className="space-y-6">
      {editedEntries.map((entry, index) => (
        <div key={entry.id} className="relative rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => removeEntry(index)}
            className="absolute right-4 top-4 rounded-full p-2 text-red-500 hover:bg-red-50"
            aria-label="Delete journey entry"
            title="Delete journey entry"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={`journey-title-${entry.id}`} className="text-sm font-medium text-gray-700">
                Title<span className="text-red-500">*</span>
              </label>
              <input
                id={`journey-title-${entry.id}`}
                type="text"
                value={entry.club_name}
                onChange={event => updateField(index, 'club_name', event.target.value)}
                className={`mt-1 w-full rounded-lg border px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors[`${index}-club_name`] ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Amsterdam Hockey Club"
              />
              {errors[`${index}-club_name`] && <p className="mt-1 text-sm text-red-600">{errors[`${index}-club_name`]}</p>}
            </div>

            <div>
              <label htmlFor={`journey-category-${entry.id}`} className="text-sm font-medium text-gray-700">
                Category
              </label>
              <select
                id={`journey-category-${entry.id}`}
                value={entry.entry_type}
                onChange={event => updateField(index, 'entry_type', event.target.value as JourneyType)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
              >
                {ENTRY_TYPES.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`journey-role-${entry.id}`} className="text-sm font-medium text-gray-700">
                Role<span className="text-red-500">*</span>
              </label>
              <input
                id={`journey-role-${entry.id}`}
                type="text"
                value={entry.position_role}
                onChange={event => updateField(index, 'position_role', event.target.value)}
                className={`mt-1 w-full rounded-lg border px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors[`${index}-position_role`] ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Team captain"
              />
              {errors[`${index}-position_role`] && <p className="mt-1 text-sm text-red-600">{errors[`${index}-position_role`]}</p>}
            </div>

            <div>
              <label htmlFor={`journey-context-${entry.id}`} className="text-sm font-medium text-gray-700">
                Competition / Context<span className="text-red-500">*</span>
              </label>
              <input
                id={`journey-context-${entry.id}`}
                type="text"
                value={entry.division_league}
                onChange={event => updateField(index, 'division_league', event.target.value)}
                className={`mt-1 w-full rounded-lg border px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors[`${index}-division_league`] ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="Hoofdklasse"
              />
              {errors[`${index}-division_league`] && (
                <p className="mt-1 text-sm text-red-600">{errors[`${index}-division_league`]}</p>
              )}
            </div>

            <div>
              <label htmlFor={`journey-city-${entry.id}`} className="text-sm font-medium text-gray-700">
                City
              </label>
              <input
                id={`journey-city-${entry.id}`}
                type="text"
                value={entry.location_city || ''}
                onChange={event => updateField(index, 'location_city', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                placeholder="Amsterdam"
              />
            </div>

            <div>
              <label htmlFor={`journey-country-${entry.id}`} className="text-sm font-medium text-gray-700">
                Country
              </label>
              <input
                id={`journey-country-${entry.id}`}
                type="text"
                value={entry.location_country || ''}
                onChange={event => updateField(index, 'location_country', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                placeholder="Netherlands"
              />
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">Start date<span className="text-red-500">*</span></span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  aria-label="Start month"
                  value={entry.startMonthDraft ?? ''}
                  onChange={event => updateDraftDate(index, 'start', 'month', event.target.value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors[`${index}-start_date`] ? 'border-red-400' : 'border-gray-300'}`}
                >
                  <option value="">Month</option>
                  {MONTH_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Start year"
                  value={entry.startYearDraft ?? ''}
                  onChange={event => updateDraftDate(index, 'start', 'year', event.target.value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500 ${errors[`${index}-start_date`] ? 'border-red-400' : 'border-gray-300'}`}
                >
                  <option value="">Year</option>
                  {YEAR_OPTIONS.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              {errors[`${index}-start_date`] && <p className="mt-1 text-sm text-red-600">{errors[`${index}-start_date`]}</p>}
            </div>

            <div>
              <span className="text-sm font-medium text-gray-700">End date</span>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  aria-label="End month"
                  value={entry.endMonthDraft ?? ''}
                  onChange={event => updateDraftDate(index, 'end', 'month', event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Month</option>
                  {MONTH_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="End year"
                  value={entry.endYearDraft ?? ''}
                  onChange={event => updateDraftDate(index, 'end', 'year', event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Year</option>
                  {YEAR_OPTIONS.map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-gray-500">Leave empty to keep it marked as Present.</p>
            </div>

            <div className="md:col-span-2">
              <label htmlFor={`journey-description-${entry.id}`} className="text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id={`journey-description-${entry.id}`}
                value={entry.description || ''}
                onChange={event => updateField(index, 'description', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                rows={3}
                placeholder="Professional player in the Hoofdklasse"
              />
            </div>

            <div>
              <label htmlFor={`journey-badge-${entry.id}`} className="text-sm font-medium text-gray-700">
                Badge label
              </label>
              <input
                id={`journey-badge-${entry.id}`}
                type="text"
                value={entry.badge_label || ''}
                onChange={event => updateField(index, 'badge_label', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                placeholder="Club"
              />
            </div>

            <div>
              <label htmlFor={`journey-image-${entry.id}`} className="text-sm font-medium text-gray-700">
                Image URL
              </label>
              <input
                id={`journey-image-${entry.id}`}
                type="url"
                value={entry.image_url || ''}
                onChange={event => updateField(index, 'image_url', event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="text-sm font-medium text-gray-700">Highlights</label>
            <div className="mt-2 space-y-2">
              {entry.highlights.map((highlight, highlightIdx) => (
                <div key={highlightIdx} className="flex gap-2">
                  <input
                    type="text"
                    value={highlight}
                    onChange={event => handleHighlightChange(index, highlightIdx, event.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
                    placeholder="Top scorer 2023 season"
                  />
                  <button
                    type="button"
                    onClick={() => removeHighlight(index, highlightIdx)}
                    className="rounded-lg border border-gray-200 px-3 text-gray-500 hover:bg-gray-50"
                    aria-label="Remove highlight"
                    title="Remove highlight"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateField(index, 'highlights', [...entry.highlights, ''])}
                className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Add highlight
              </button>
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={handleAddEntry}
        className="w-full rounded-2xl border-2 border-dashed border-gray-300 py-4 text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600"
      >
        <Plus className="mr-2 inline h-4 w-4" />
        Add Journey Entry
      </button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Journey</h2>
          <p className="text-sm text-gray-600">Showcase the clubs, teams, and milestones that shaped your path.</p>
        </div>
        {!readOnly && (
          isEditing ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <Button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit2 className="h-4 w-4" />}
                {saving ? 'Saving…' : 'Save Journey'}
              </Button>
            </div>
          ) : (
            <Button onClick={beginEditing} className="inline-flex items-center gap-2">
              <Edit2 className="h-4 w-4" />
              Manage Journey
            </Button>
          )
        )}
      </div>

      {isEditing ? renderEditor() : renderTimeline()}
    </div>
  )
}
