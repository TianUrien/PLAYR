import { useState, useEffect } from 'react'
import { X, Users, Loader2 } from 'lucide-react'
import type { EmailTemplate, WorldCountry } from '../types'
import { getAllCountries, createEmailCampaign } from '../api/adminApi'
import { useAudiencePreview } from '../hooks/useEmailStats'

interface CreateCampaignModalProps {
  templates: EmailTemplate[]
  onClose: () => void
  onCreated: () => void
}

export function CreateCampaignModal({ templates, onClose, onCreated }: CreateCampaignModalProps) {
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [category, setCategory] = useState('notification')
  const [filterRole, setFilterRole] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [countries, setCountries] = useState<WorldCountry[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { preview, isLoading: previewLoading, error: previewError, fetchPreview, reset: resetPreview } = useAudiencePreview()

  const activeTemplates = templates.filter(t => t.is_active)

  useEffect(() => {
    getAllCountries().then(setCountries).catch(() => {})
  }, [])

  const audienceFilter = {
    ...(filterRole ? { role: filterRole } : {}),
    ...(filterCountry ? { country: filterCountry } : {}),
  }

  const handlePreview = () => {
    fetchPreview(category, audienceFilter)
  }

  const handleCreate = async () => {
    if (!name.trim() || !templateId) return
    setCreating(true)
    setError(null)
    try {
      await createEmailCampaign({
        name: name.trim(),
        template_id: templateId,
        category,
        audience_filter: audienceFilter,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign')
    } finally {
      setCreating(false)
    }
  }

  // Reset preview when filters change
  useEffect(() => {
    resetPreview()
  }, [filterRole, filterCountry, category, resetPreview])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Campaign</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {/* Campaign name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. February Player Newsletter"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select a template...</option>
              {activeTemplates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="notification">Notification</option>
              <option value="marketing">Marketing</option>
            </select>
          </div>

          {/* Audience filters */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Audience Filters</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Role</label>
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All roles</option>
                  <option value="player">Player</option>
                  <option value="coach">Coach</option>
                  <option value="club">Club</option>
                  <option value="brand">Brand</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Country</label>
                <select
                  value={filterCountry}
                  onChange={(e) => setFilterCountry(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">All countries</option>
                  {countries.map(c => (
                    <option key={c.id} value={c.code}>{c.flag_emoji} {c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview audience button */}
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewLoading}
              className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-700 font-medium disabled:opacity-50"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              Preview Audience
            </button>

            {previewError && (
              <p className="mt-2 text-xs text-red-600">{previewError}</p>
            )}

            {/* Preview results */}
            {preview && (
              <div className="mt-3 bg-gray-50 rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-900 mb-2">
                  {preview.count.toLocaleString()} recipient{preview.count !== 1 ? 's' : ''} match
                </p>
                {preview.sample.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 mb-1">Sample:</p>
                    {preview.sample.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <span className="text-gray-700 truncate max-w-[180px]">{s.full_name || s.email}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 capitalize">{s.role}</span>
                          {s.country_name && <span className="text-gray-400">{s.country_name}</span>}
                        </div>
                      </div>
                    ))}
                    {preview.count > 10 && (
                      <p className="text-xs text-gray-400 mt-1">...and {(preview.count - 10).toLocaleString()} more</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !templateId || creating}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Draft Campaign
          </button>
        </div>
      </div>
    </div>
  )
}
