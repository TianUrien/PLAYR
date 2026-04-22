/**
 * UmpireAppointmentEditor
 *
 * Add / edit modal for a single umpire_appointments row. Owner-only — RLS
 * will reject the mutation if the caller isn't the profile owner.
 *
 * Form fields match the table columns minus internal ids:
 *   event_name (required)  ·  organizer  ·  match_level  ·  match_format
 *   location_city  ·  location_country  ·  start_date  ·  end_date  ·  description
 *
 * Kept intentionally simpler than JourneyTab's month/year picker — full-date
 * inputs are cleaner and appointments are typically short-range events (a
 * single tournament weekend, not a multi-year club tenure).
 */

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { logger } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { optimizeImage, validateImage } from '@/lib/imageOptimization'
import { deleteStorageObject } from '@/lib/storage'
import type {
  UmpireAppointment,
  UmpireAppointmentInput,
} from '@/hooks/useUmpireAppointments'

const JOURNEY_BUCKET = 'journey'
const UMPIRE_PATH_PREFIX = 'umpire'

const MATCH_FORMATS: Array<{ value: '' | 'outdoor_11v11' | 'indoor_5v5' | 'other'; label: string }> = [
  { value: '', label: 'Not specified' },
  { value: 'outdoor_11v11', label: 'Outdoor 11v11' },
  { value: 'indoor_5v5', label: 'Indoor 5v5' },
  { value: 'other', label: 'Other' },
]

interface UmpireAppointmentEditorProps {
  isOpen: boolean
  appointment: UmpireAppointment | null
  onClose: () => void
  onSave: (input: UmpireAppointmentInput, id?: string) => Promise<unknown>
}

interface FormState {
  event_name: string
  organizer: string
  match_level: string
  match_format: '' | 'outdoor_11v11' | 'indoor_5v5' | 'other'
  location_city: string
  location_country: string
  start_date: string
  end_date: string
  description: string
}

const emptyForm = (): FormState => ({
  event_name: '',
  organizer: '',
  match_level: '',
  match_format: '',
  location_city: '',
  location_country: '',
  start_date: '',
  end_date: '',
  description: '',
})

const seedForm = (appointment: UmpireAppointment | null): FormState => {
  if (!appointment) return emptyForm()
  return {
    event_name: appointment.event_name ?? '',
    organizer: appointment.organizer ?? '',
    match_level: appointment.match_level ?? '',
    match_format: (appointment.match_format as FormState['match_format']) ?? '',
    location_city: appointment.location_city ?? '',
    location_country: appointment.location_country ?? '',
    start_date: appointment.start_date ?? '',
    end_date: appointment.end_date ?? '',
    description: appointment.description ?? '',
  }
}

export default function UmpireAppointmentEditor({
  isOpen,
  appointment,
  onClose,
  onSave,
}: UmpireAppointmentEditorProps) {
  const userId = useAuthStore((state) => state.user?.id ?? null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(appointment?.image_url ?? null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setForm(seedForm(appointment))
      setImageUrl(appointment?.image_url ?? null)
      setError(null)
      setImageError(null)
      setSubmitting(false)
      setUploading(false)
    }
  }, [isOpen, appointment])

  if (!isOpen) return null

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset the input so the same file re-picked fires onChange again.
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file || !userId) return

    setImageError(null)
    const validation = validateImage(file, { maxSizeMB: 5 })
    if (!validation.valid) {
      setImageError(validation.error ?? 'Invalid image')
      return
    }

    setUploading(true)
    try {
      const optimized = await optimizeImage(file, {
        maxWidth: 1600,
        maxHeight: 1200,
        maxSizeMB: 1,
      })
      const ts = Date.now()
      const rand = Math.random().toString(36).slice(2, 10)
      const ext = (optimized.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${userId}/${UMPIRE_PATH_PREFIX}/${ts}_${rand}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(JOURNEY_BUCKET)
        .upload(path, optimized, { cacheControl: '31536000', upsert: false })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from(JOURNEY_BUCKET).getPublicUrl(path)
      setImageUrl(data.publicUrl)
    } catch (err) {
      logger.error('[UmpireAppointmentEditor] image upload failed:', err)
      setImageError('Upload failed. Please try another image.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveImage = () => {
    setImageUrl(null)
  }

  const trimmed = {
    ...form,
    event_name: form.event_name.trim(),
    organizer: form.organizer.trim(),
    match_level: form.match_level.trim(),
    location_city: form.location_city.trim(),
    location_country: form.location_country.trim(),
    description: form.description.trim(),
  }

  const dateOrderOk =
    !trimmed.start_date || !trimmed.end_date || trimmed.end_date >= trimmed.start_date

  const canSubmit = !submitting && !uploading && trimmed.event_name.length > 0 && dateOrderOk

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const input: UmpireAppointmentInput = {
        event_name: trimmed.event_name,
        organizer: trimmed.organizer || null,
        match_level: trimmed.match_level || null,
        match_format: trimmed.match_format || null,
        location_city: trimmed.location_city || null,
        location_country: trimmed.location_country || null,
        start_date: trimmed.start_date || null,
        end_date: trimmed.end_date || null,
        description: trimmed.description || null,
        image_url: imageUrl,
      }
      const result = await onSave(input, appointment?.id)
      if (result === null) {
        // Hook returns null on failure — surface a generic error (the hook
        // already logs specifics).
        setError('Could not save. Please try again.')
        setSubmitting(false)
        return
      }

      // Best-effort cleanup: if the saved image replaced (or cleared) an
      // older one, delete the orphan from storage. Failure is logged, not
      // surfaced — the save already succeeded.
      const originalUrl = appointment?.image_url ?? null
      if (originalUrl && originalUrl !== imageUrl) {
        void deleteStorageObject({
          bucket: JOURNEY_BUCKET,
          publicUrl: originalUrl,
          context: 'umpire-appointment-replace',
        })
      }

      onClose()
    } catch (err) {
      logger.error('[UmpireAppointmentEditor] save failed:', err)
      setError(err instanceof Error ? err.message : 'Could not save appointment')
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting || uploading) return

    // If the user uploaded a new image but is cancelling without saving,
    // clean up the orphan. The original image (if any) stays put.
    const originalUrl = appointment?.image_url ?? null
    if (imageUrl && imageUrl !== originalUrl) {
      void deleteStorageObject({
        bucket: JOURNEY_BUCKET,
        publicUrl: imageUrl,
        context: 'umpire-appointment-cancel',
      })
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 transition-colors"
            disabled={submitting}
            aria-label="Close editor"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>

          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {appointment ? 'Edit appointment' : 'Add an appointment'}
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Tournaments, leagues, and matches you've officiated.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Photo <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading || submitting}
                aria-label="Upload appointment photo"
              />
              {imageUrl ? (
                <div className="relative group">
                  <img
                    src={imageUrl}
                    alt="Appointment"
                    className="w-full h-40 object-cover rounded-lg border border-gray-200"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 underline"
                      disabled={uploading || submitting}
                    >
                      Replace
                    </button>
                    <span className="text-gray-300">·</span>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-xs font-medium text-red-600 hover:text-red-700 underline"
                      disabled={uploading || submitting}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || submitting || !userId}
                  className="w-full flex items-center justify-center gap-2 px-3 py-6 text-sm font-medium text-gray-600 border-2 border-dashed border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading…
                    </>
                  ) : (
                    <>
                      <ImagePlus className="w-4 h-4" />
                      Add a photo
                    </>
                  )}
                </button>
              )}
              {imageError && <p className="text-xs text-red-600 mt-2">{imageError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Event name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.event_name}
                onChange={(e) => setForm({ ...form, event_name: e.target.value })}
                placeholder="EuroHockey Junior Championship 2026"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={submitting}
                autoFocus
                maxLength={160}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Organizer <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={form.organizer}
                onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                placeholder="EuroHockey · FIH · England Hockey"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={submitting}
                maxLength={120}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Match level <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.match_level}
                  onChange={(e) => setForm({ ...form, match_level: e.target.value })}
                  placeholder="U21 International · National League"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Format
                </label>
                <select
                  value={form.match_format}
                  onChange={(e) =>
                    setForm({ ...form, match_format: e.target.value as FormState['match_format'] })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                  disabled={submitting}
                >
                  {MATCH_FORMATS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.location_city}
                  onChange={(e) => setForm({ ...form, location_city: e.target.value })}
                  placeholder="Amsterdam"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                  maxLength={80}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Country <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.location_country}
                  onChange={(e) => setForm({ ...form, location_country: e.target.value })}
                  placeholder="Netherlands"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                  maxLength={80}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End date
                </label>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={submitting}
                />
              </div>
            </div>
            {!dateOrderOk && (
              <p className="text-xs text-red-600">End date can't be before start date.</p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What did you officiate — final, pool stage, specific matches?"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                disabled={submitting}
                maxLength={600}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-[#8026FA] to-[#924CEC] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : appointment ? (
                'Save changes'
              ) : (
                'Add appointment'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
