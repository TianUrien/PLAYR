import { useState, useEffect, useCallback } from 'react'
import { Edit2, Plus, X, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { useToastStore } from '@/lib/toast'
import type { PlayingHistory } from '@/lib/supabase'
import Button from './Button'

const HOCKEY_POSITIONS = [
  'Goalkeeper',
  'Defender',
  'Midfielder',
  'Forward'
] as const

type EditablePlayingHistory = Omit<PlayingHistory, 'achievements'> & {
  achievements: string[]
}

interface HistoryTabProps {
  profileId?: string
  readOnly?: boolean
}

export default function HistoryTab({ profileId, readOnly = false }: HistoryTabProps) {
  const { user } = useAuthStore()
  const { addToast } = useToastStore()
  const targetUserId = profileId || user?.id
  const [history, setHistory] = useState<EditablePlayingHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editedHistory, setEditedHistory] = useState<EditablePlayingHistory[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fetchHistory = useCallback(async () => {
    if (!targetUserId) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('playing_history')
        .select('*')
        .eq('user_id', targetUserId)
        .order('display_order', { ascending: false })

      if (error) throw error

      const normalizedHistory = (data || []).map(entry => ({
        ...entry,
        achievements: entry.achievements ?? []
      }))

      setHistory(normalizedHistory)
    } catch (error) {
      console.error('Error fetching playing history:', error)
    } finally {
      setIsLoading(false)
    }
  }, [targetUserId])

  useEffect(() => {
    if (targetUserId) {
      fetchHistory()
    }
  }, [targetUserId, fetchHistory])

  const handleEdit = () => {
    setEditedHistory(history.map(entry => ({
      ...entry,
      achievements: [...entry.achievements]
    })))
    setIsEditing(true)
    setErrors({})
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedHistory([])
    setErrors({})
  }

  const handleAddEntry = () => {
    setEditedHistory(prev => {
      const newEntry: EditablePlayingHistory = {
        id: `temp-${Date.now()}`,
        user_id: user?.id || '',
        club_name: '',
        position_role: '',
        years: '',
        division_league: '',
        achievements: [],
        display_order: prev.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return [newEntry, ...prev]
    })
  }

  const handleDeleteEntry = (index: number) => {
    setEditedHistory(prev => prev.filter((_, i) => i !== index))
  }

  const handleFieldChange = (index: number, field: keyof EditablePlayingHistory, value: string) => {
    setEditedHistory(prev =>
      prev.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry
      )
    )
    
    // Clear error for this field
    const errorKey = `${index}-${String(field)}`
    if (errors[errorKey]) {
      const newErrors = { ...errors }
      delete newErrors[errorKey]
      setErrors(newErrors)
    }
  }

  const handleAddAchievement = (index: number) => {
    setEditedHistory(prev =>
      prev.map((entry, idx) =>
        idx === index
          ? { ...entry, achievements: [...entry.achievements, ''] }
          : entry
      )
    )
  }

  const handleAchievementChange = (entryIndex: number, achIndex: number, value: string) => {
    setEditedHistory(prev =>
      prev.map((entry, idx) => {
        if (idx !== entryIndex) return entry
        const achievements = [...entry.achievements]
        achievements[achIndex] = value
        return { ...entry, achievements }
      })
    )
  }

  const handleRemoveAchievement = (entryIndex: number, achIndex: number) => {
    setEditedHistory(prev =>
      prev.map((entry, idx) =>
        idx === entryIndex
          ? {
              ...entry,
              achievements: entry.achievements.filter((_, i: number) => i !== achIndex)
            }
          : entry
      )
    )
  }

  const validateFields = (): boolean => {
    const newErrors: Record<string, string> = {}
    let isValid = true

    editedHistory.forEach((entry, index) => {
      if (!entry.club_name.trim()) {
        newErrors[`${index}-club_name`] = 'Club/Team name is required'
        isValid = false
      }
      if (!entry.position_role.trim()) {
        newErrors[`${index}-position_role`] = 'Position/Role is required'
        isValid = false
      }
      if (!entry.years.trim()) {
        newErrors[`${index}-years`] = 'Years are required'
        isValid = false
      }
      if (!entry.division_league.trim()) {
        newErrors[`${index}-division_league`] = 'Division/League is required'
        isValid = false
      }
    })

    setErrors(newErrors)
    return isValid
  }

  const handleSave = async () => {
    if (!user || !validateFields()) return

    setIsLoading(true)
    try {
      // Delete entries that were removed
      const deletedIds = history
        .filter(h => !editedHistory.find(e => e.id === h.id))
        .map(h => h.id)
        .filter(id => !id.startsWith('temp-'))

      if (deletedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('playing_history')
          .delete()
          .in('id', deletedIds)

        if (deleteError) throw deleteError
      }

      // Update display order and save entries
      const entriesToSave = editedHistory.map((entry, index) => ({
        ...entry,
        display_order: editedHistory.length - index,
        user_id: user.id,
        achievements: entry.achievements.filter((achievement: string) => achievement.trim() !== ''),
        updated_at: new Date().toISOString(),
      }))

      for (const entry of entriesToSave) {
        if (entry.id.startsWith('temp-')) {
          // New entry - insert
          const { error: insertError } = await supabase
            .from('playing_history')
            .insert({
              user_id: entry.user_id,
              club_name: entry.club_name,
              position_role: entry.position_role,
              years: entry.years,
              division_league: entry.division_league,
              achievements: entry.achievements,
              display_order: entry.display_order,
            })

          if (insertError) throw insertError
        } else {
          // Existing entry - update
          const { error: updateError } = await supabase
            .from('playing_history')
            .update({
              club_name: entry.club_name,
              position_role: entry.position_role,
              years: entry.years,
              division_league: entry.division_league,
              achievements: entry.achievements,
              display_order: entry.display_order,
              updated_at: entry.updated_at,
            })
            .eq('id', entry.id)

          if (updateError) throw updateError
        }
      }

      await fetchHistory()
      setIsEditing(false)
      setEditedHistory([])
      setErrors({})
      addToast('Playing history updated successfully.', 'success')
    } catch (error) {
      console.error('Error saving playing history:', error)
      addToast('Failed to save changes. Please try again.', 'error')
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading && !isEditing) {
    return <div className="text-center py-12 text-gray-500">Loading history...</div>
  }

  const displayData = isEditing ? editedHistory : history

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg 
            className="w-7 h-7 text-gray-700" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            strokeWidth={2}
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              d="M3 21h18M4 18h16M6 15h12M8 12h8M9 9h6M10 6h4M11 3h2"
            />
          </svg>
          <h2 className="text-2xl font-bold text-gray-900">Playing History</h2>
        </div>
        {!readOnly && !isEditing && history.length > 0 && (
          <Button
            variant="outline"
            onClick={handleEdit}
            className="flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
        )}
        {!readOnly && isEditing && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <Button
              onClick={handleSave}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {!isEditing && history.length === 0 && (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <svg 
                className="w-8 h-8 text-gray-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={2}
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  d="M3 21h18M4 18h16M6 15h12M8 12h8M9 9h6M10 6h4M11 3h2"
                />
              </svg>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Playing History Yet</h3>
          <p className="text-gray-600 mb-6">
            {readOnly 
              ? 'No playing history available' 
              : 'Add your club history to showcase your playing experience'
            }
          </p>
          {!readOnly && (
            <Button onClick={handleEdit} className="flex items-center gap-2 mx-auto">
              <Plus className="w-4 h-4" />
              Add Playing History
            </Button>
          )}
        </div>
      )}

      {/* Read Mode - Card List */}
      {!isEditing && history.length > 0 && (
        <div className="space-y-4">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{entry.club_name}</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {entry.position_role} • {entry.years}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">{entry.division_league}</p>
                </div>
              </div>
              {entry.achievements.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Achievements:</p>
                  <div className="flex flex-wrap gap-2">
                    {entry.achievements.map((achievement, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        {achievement}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit Mode - Inline Forms */}
      {isEditing && (
        <div className="space-y-6">
          {displayData.map((entry, index) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-300 rounded-xl p-6 relative"
            >
              {/* Delete Button */}
              <button
                onClick={() => handleDeleteEntry(index)}
                className="absolute top-4 right-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete entry"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-12">
                {/* Club/Team Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Club/Team Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={entry.club_name}
                    onChange={(e) => handleFieldChange(index, 'club_name', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent ${
                      errors[`${index}-club_name`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., Holcombe Hockey Club"
                  />
                  {errors[`${index}-club_name`] && (
                    <p className="mt-1 text-sm text-red-600">{errors[`${index}-club_name`]}</p>
                  )}
                </div>

                {/* Position/Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={entry.position_role}
                    onChange={(e) => handleFieldChange(index, 'position_role', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent bg-white ${
                      errors[`${index}-position_role`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    title="Select position"
                  >
                    <option value="">Select a position</option>
                    {HOCKEY_POSITIONS.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                  {errors[`${index}-position_role`] && (
                    <p className="mt-1 text-sm text-red-600">{errors[`${index}-position_role`]}</p>
                  )}
                </div>

                {/* Years */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Years <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={entry.years}
                    onChange={(e) => handleFieldChange(index, 'years', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent ${
                      errors[`${index}-years`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., 2022 - Present"
                  />
                  {errors[`${index}-years`] && (
                    <p className="mt-1 text-sm text-red-600">{errors[`${index}-years`]}</p>
                  )}
                </div>

                {/* Division/League */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Division/League <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={entry.division_league}
                    onChange={(e) => handleFieldChange(index, 'division_league', e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent ${
                      errors[`${index}-division_league`] ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="e.g., England Premier Division"
                  />
                  {errors[`${index}-division_league`] && (
                    <p className="mt-1 text-sm text-red-600">{errors[`${index}-division_league`]}</p>
                  )}
                </div>
              </div>

              {/* Achievements */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Achievements
                </label>
                <div className="space-y-2">
                  {entry.achievements.map((achievement, achIndex) => (
                    <div key={achIndex} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={achievement}
                        onChange={(e) => handleAchievementChange(index, achIndex, e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                        placeholder="e.g., Division Champions 2023"
                      />
                      <button
                        onClick={() => handleRemoveAchievement(index, achIndex)}
                        className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                        title="Remove achievement"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => handleAddAchievement(index)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#6366f1] hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Achievement
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add New Entry Button */}
          <button
            onClick={handleAddEntry}
            className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-[#6366f1] hover:text-[#6366f1] transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Plus className="w-5 h-5" />
            Add New Entry
          </button>
        </div>
      )}
    </div>
  )
}
