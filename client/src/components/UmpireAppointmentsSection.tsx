/**
 * UmpireAppointmentsSection
 *
 * Officiating history card. Shown on UmpireDashboard (owner + readOnly via
 * PublicUmpireProfile) and anywhere else we need a chronological list of the
 * tournaments and matches an umpire has officiated.
 *
 * Owner sees an "Add appointment" CTA and edit/delete controls per entry.
 * Viewers see the list only. An empty list is a legitimate state — nothing
 * rendered on public profiles when empty, friendly CTA for the owner.
 */

import { useState } from 'react'
import { Award, Building2, Calendar, Edit2, MapPin, Plus, Trash2 } from 'lucide-react'
import {
  useUmpireAppointments,
  type UmpireAppointment,
  type UmpireAppointmentInput,
} from '@/hooks/useUmpireAppointments'
import { deleteStorageObject } from '@/lib/storage'
import UmpireAppointmentEditor from './UmpireAppointmentEditor'

const JOURNEY_BUCKET = 'journey'

interface UmpireAppointmentsSectionProps {
  userId: string
  readOnly?: boolean
}

const MATCH_FORMAT_LABELS: Record<string, string> = {
  outdoor_11v11: 'Outdoor 11v11',
  indoor_5v5: 'Indoor 5v5',
  other: 'Other format',
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateRange(start: string | null, end: string | null): string | null {
  const s = formatDate(start)
  const e = formatDate(end)
  if (s && e && start !== end) return `${s} — ${e}`
  if (s) return s
  if (e) return e
  return null
}

function formatLocation(city: string | null, country: string | null): string | null {
  const parts = [city?.trim(), country?.trim()].filter((v): v is string => Boolean(v))
  return parts.length ? parts.join(', ') : null
}

export default function UmpireAppointmentsSection({
  userId,
  readOnly = false,
}: UmpireAppointmentsSectionProps) {
  const { appointments, loading, error, create, update, remove } = useUmpireAppointments({
    userId,
  })
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<UmpireAppointment | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Hide the section entirely for public viewers when there are no entries —
  // empty officiating history shouldn't leave a hollow "Officiating History"
  // card on a viewer's screen. Owners still see their empty-state CTA.
  if (readOnly && !loading && appointments.length === 0) {
    return null
  }

  const openCreate = () => {
    setEditingAppointment(null)
    setEditorOpen(true)
  }

  const openEdit = (appointment: UmpireAppointment) => {
    setEditingAppointment(appointment)
    setEditorOpen(true)
    setPendingDeleteId(null)
  }

  const handleSave = async (input: UmpireAppointmentInput, id?: string) => {
    return id ? update(id, input) : create(input)
  }

  const handleDeleteRequest = (id: string) => {
    setPendingDeleteId((current) => (current === id ? null : id))
  }

  const handleDeleteConfirm = async (id: string) => {
    // Grab the image URL before the row is gone so we can clean up storage.
    const target = appointments.find((a) => a.id === id)
    const ok = await remove(id)
    if (!ok) return
    setPendingDeleteId(null)
    if (target?.image_url) {
      void deleteStorageObject({
        bucket: JOURNEY_BUCKET,
        publicUrl: target.image_url,
        context: 'umpire-appointment-delete',
      })
    }
  }

  return (
    <section className="mt-6 bg-white rounded-2xl shadow-sm p-5 md:p-7 animate-slide-in-up">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 inline-flex items-center gap-2">
          <Award className="w-4 h-4" />
          Officiating History
          {appointments.length > 0 && (
            <span className="text-gray-400 normal-case tracking-normal font-normal">
              · {appointments.length}
            </span>
          )}
        </h2>
        {!readOnly && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : appointments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-5 text-center">
          <p className="text-sm font-medium text-gray-900 mb-1">No appointments yet</p>
          <p className="text-sm text-gray-500 mb-3">
            Add tournaments, leagues, and matches you've officiated to build your credibility timeline.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#8026FA] to-[#924CEC] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            Add your first appointment
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {appointments.map((a) => {
            const dateRange = formatDateRange(a.start_date, a.end_date)
            const location = formatLocation(a.location_city, a.location_country)
            const formatLabel = a.match_format ? MATCH_FORMAT_LABELS[a.match_format] : null
            const isPendingDelete = pendingDeleteId === a.id

            return (
              <li
                key={a.id}
                className="rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 transition-colors"
              >
                {a.image_url && (
                  <img
                    src={a.image_url}
                    alt={a.event_name}
                    loading="lazy"
                    className="w-full h-40 object-cover"
                  />
                )}
                <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 break-words">
                      {a.event_name}
                    </h3>

                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {a.match_level && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {a.match_level}
                        </span>
                      )}
                      {formatLabel && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {formatLabel}
                        </span>
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                      {a.organizer && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          {a.organizer}
                        </span>
                      )}
                      {dateRange && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {dateRange}
                        </span>
                      )}
                      {location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          {location}
                        </span>
                      )}
                    </div>

                    {a.description && (
                      <p className="mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                        {a.description}
                      </p>
                    )}
                  </div>

                  {!readOnly && (
                    <div className="flex-shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        aria-label="Edit appointment"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(a.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isPendingDelete
                            ? 'text-red-600 bg-red-50'
                            : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                        }`}
                        aria-label={isPendingDelete ? 'Cancel delete' : 'Delete appointment'}
                        title={isPendingDelete ? 'Cancel' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {!readOnly && isPendingDelete && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2">
                    <span className="text-xs font-medium text-red-800">
                      Delete this appointment? This can't be undone.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(null)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConfirm(a.id)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium text-white bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {!readOnly && (
        <UmpireAppointmentEditor
          isOpen={editorOpen}
          appointment={editingAppointment}
          onClose={() => {
            setEditorOpen(false)
            setEditingAppointment(null)
          }}
          onSave={handleSave}
        />
      )}
    </section>
  )
}
