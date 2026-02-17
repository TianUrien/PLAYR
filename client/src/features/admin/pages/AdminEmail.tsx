import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  Megaphone,
  Bell,
  Users,
  AlertTriangle,
  Send,
  Eye,
  MousePointerClick,
  CheckCircle2,
  XCircle,
  Mail,
  Plus,
  Loader2,
} from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { EmailVolumeChart } from '../components/EmailVolumeChart'
import { EmailTemplateBreakdownChart } from '../components/EmailTemplateBreakdownChart'
import { EmailDeliveryFunnelChart } from '../components/EmailDeliveryFunnelChart'
import { CreateCampaignModal } from '../components/CreateCampaignModal'
import { useEmailOverview, useEmailTemplates, useEmailCampaigns, useEmailEngagement } from '../hooks/useEmailStats'
import { sendCampaign, previewCampaignAudience } from '../api/adminApi'
import type {
  EmailTemplate,
  EmailCampaign,
  EmailEngagementItem,
} from '../types'

type TabType = 'overview' | 'campaigns' | 'notifications' | 'engagement'
type DaysFilter = 7 | 30 | 90

const STATUS_BADGES: Record<string, string> = {
  sent: 'bg-gray-100 text-gray-700',
  delivered: 'bg-green-50 text-green-700',
  opened: 'bg-blue-50 text-blue-700',
  clicked: 'bg-amber-50 text-amber-700',
  bounced: 'bg-red-50 text-red-700',
  complained: 'bg-red-100 text-red-800',
  unsubscribed: 'bg-gray-200 text-gray-700',
  failed: 'bg-red-100 text-red-700',
}

const ENGAGEMENT_BADGES: Record<string, string> = {
  sent: 'bg-gray-100 text-gray-600',
  delivered_not_opened: 'bg-yellow-50 text-yellow-700',
  opened_not_clicked: 'bg-blue-50 text-blue-700',
  clicked: 'bg-green-50 text-green-700',
  bounced: 'bg-red-50 text-red-700',
  complained: 'bg-red-100 text-red-800',
  unsubscribed: 'bg-gray-200 text-gray-700',
}

export function AdminEmail() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabType) || 'overview'
  const [activeTab, setActiveTab] = useState<TabType>(initialTab)
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(30)

  // Campaign state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null)
  const [confirmSendCampaign, setConfirmSendCampaign] = useState<EmailCampaign | null>(null)
  const [confirmAudienceCount, setConfirmAudienceCount] = useState<number | null>(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  // Engagement filters
  const [engTemplateKey, setEngTemplateKey] = useState<string>('')
  const [engStatus, setEngStatus] = useState<string>('')
  const [engRole, setEngRole] = useState<string>('')
  const [engPage, setEngPage] = useState(0)

  // Data hooks
  const overview = useEmailOverview(daysFilter)
  const templates = useEmailTemplates()
  const campaigns = useEmailCampaigns({ limit: 50 })
  const engagement = useEmailEngagement({
    template_key: engTemplateKey || undefined,
    status: engStatus || undefined,
    role: engRole || undefined,
    limit: 50,
    offset: engPage * 50,
  })

  useEffect(() => {
    document.title = 'Email Intelligence | PLAYR Admin'
  }, [])

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    setSearchParams({ tab })
  }, [setSearchParams])

  // Template table columns
  const templateColumns: Column<EmailTemplate>[] = [
    {
      key: 'name',
      label: 'Template',
      render: (_, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500 font-mono">{row.template_key}</p>
        </div>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (_, row) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
          row.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {row.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'total_sent',
      label: 'Sent',
      render: (_, row) => <span className="text-sm text-gray-700">{(row.total_sent ?? 0).toLocaleString()}</span>,
    },
    {
      key: 'open_rate',
      label: 'Open Rate',
      render: (_, row) => <span className="text-sm text-gray-700">{row.open_rate ?? 0}%</span>,
    },
    {
      key: 'click_rate',
      label: 'Click Rate',
      render: (_, row) => <span className="text-sm text-gray-700">{row.click_rate ?? 0}%</span>,
    },
    {
      key: 'current_version',
      label: 'Version',
      render: (_, row) => <span className="text-xs text-gray-500">v{row.current_version}</span>,
    },
  ]

  // Campaign table columns
  const campaignColumns: Column<EmailCampaign>[] = [
    {
      key: 'name',
      label: 'Campaign',
      render: (_, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.name}</p>
          <p className="text-xs text-gray-500">{row.template_name || row.template_key}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (_, row) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
          row.status === 'sent' ? 'bg-green-50 text-green-700' :
          row.status === 'sending' ? 'bg-blue-50 text-blue-700' :
          row.status === 'draft' ? 'bg-gray-100 text-gray-600' :
          'bg-red-50 text-red-700'
        }`}>
          {row.status}
        </span>
      ),
    },
    {
      key: 'total_recipients',
      label: 'Recipients',
      render: (_, row) => <span className="text-sm text-gray-700">{row.total_recipients.toLocaleString()}</span>,
    },
    {
      key: 'total_sent',
      label: 'Sent',
      render: (_, row) => <span className="text-sm text-gray-700">{row.total_sent.toLocaleString()}</span>,
    },
    {
      key: 'total_opened',
      label: 'Opened',
      render: (_, row) => <span className="text-sm text-gray-700">{row.total_opened.toLocaleString()}</span>,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (_, row) => <span className="text-xs text-gray-500">{new Date(row.created_at).toLocaleDateString()}</span>,
    },
  ]

  // Engagement table columns
  const engagementColumns: Column<EmailEngagementItem>[] = [
    {
      key: 'recipient_name',
      label: 'Recipient',
      render: (_, row) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.recipient_name || 'Unknown'}</p>
          <p className="text-xs text-gray-500">{row.recipient_email}</p>
        </div>
      ),
    },
    {
      key: 'template_name',
      label: 'Template',
      render: (_, row) => <span className="text-sm text-gray-700">{row.template_name || row.template_key}</span>,
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (_, row) => <span className="text-sm text-gray-600 truncate max-w-[200px] block">{row.subject}</span>,
    },
    {
      key: 'engagement_state',
      label: 'Status',
      render: (_, row) => (
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full capitalize ${
          ENGAGEMENT_BADGES[row.engagement_state] || STATUS_BADGES[row.status] || 'bg-gray-100 text-gray-600'
        }`}>
          {row.engagement_state.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'sent_at',
      label: 'Sent',
      render: (_, row) => <span className="text-xs text-gray-500">{new Date(row.sent_at).toLocaleString()}</span>,
    },
  ]

  const stats = overview.data
  const isLoading = overview.isLoading

  if (overview.error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load email data</h2>
        <p className="text-sm text-red-600 mb-4">{overview.error}</p>
        <button onClick={overview.refetch} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">Email delivery, engagement analytics, and template management</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(Number(e.target.value) as DaysFilter)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {([
            { id: 'overview' as TabType, label: 'Overview', icon: BarChart3 },
            { id: 'campaigns' as TabType, label: 'Campaigns', icon: Megaphone },
            { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
            { id: 'engagement' as TabType, label: 'User Engagement', icon: Users },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Sent" value={stats?.total_sent ?? 0} icon={Send} color="purple" loading={isLoading} />
            <StatCard label="Delivery Rate" value={`${stats?.delivery_rate ?? 0}%`} icon={CheckCircle2} color="green" loading={isLoading} />
            <StatCard label="Open Rate" value={`${stats?.open_rate ?? 0}%`} icon={Eye} color="blue" loading={isLoading} />
            <StatCard label="Click Rate" value={`${stats?.click_rate ?? 0}%`} icon={MousePointerClick} color="amber" loading={isLoading} />
            <StatCard label="Bounce Rate" value={`${stats?.bounce_rate ?? 0}%`} icon={XCircle} color="red" loading={isLoading} />
            <StatCard label="Complaints" value={stats?.total_complained ?? 0} icon={Mail} color="gray" loading={isLoading} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <EmailVolumeChart data={stats?.daily_trend ?? []} loading={isLoading} />
            <EmailDeliveryFunnelChart
              sent={stats?.total_sent ?? 0}
              delivered={stats?.total_delivered ?? 0}
              opened={stats?.total_opened ?? 0}
              clicked={stats?.total_clicked ?? 0}
              loading={isLoading}
            />
          </div>

          <EmailTemplateBreakdownChart data={stats?.template_breakdown ?? []} loading={isLoading} />
        </div>
      )}

      {/* Tab: Campaigns */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Campaign
              </button>
            </div>
            <DataTable
              data={campaigns.data}
              columns={campaignColumns}
              keyField="id"
              loading={campaigns.isLoading}
              emptyMessage="No campaigns yet. Click 'Create Campaign' to get started."
              actions={[
                {
                  label: 'Send',
                  onClick: async (row: EmailCampaign) => {
                    if (row.status !== 'draft') return
                    setConfirmSendCampaign(row)
                    setConfirmAudienceCount(null)
                    setConfirmLoading(true)
                    try {
                      const preview = await previewCampaignAudience(
                        row.category,
                        (row.audience_filter as { role?: string; country?: string }) || {}
                      )
                      setConfirmAudienceCount(preview.count)
                    } catch {
                      setConfirmAudienceCount(-1)
                    } finally {
                      setConfirmLoading(false)
                    }
                  },
                  disabled: (row: EmailCampaign) => row.status !== 'draft',
                },
              ]}
            />
          </div>

          {/* Create Campaign Modal */}
          {showCreateModal && (
            <CreateCampaignModal
              templates={templates.data}
              onClose={() => setShowCreateModal(false)}
              onCreated={() => {
                setShowCreateModal(false)
                campaigns.refetch()
              }}
            />
          )}

          {/* Send Confirmation Dialog */}
          {confirmSendCampaign && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Send Campaign</h3>
                <p className="text-sm text-gray-600 mb-4">
                  You are about to send <span className="font-medium">{confirmSendCampaign.name}</span>.
                </p>

                {confirmLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Calculating audience...
                  </div>
                ) : confirmAudienceCount !== null && confirmAudienceCount >= 0 ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-purple-800 font-medium">
                      This will send to {confirmAudienceCount.toLocaleString()} recipient{confirmAudienceCount !== 1 ? 's' : ''}.
                    </p>
                  </div>
                ) : confirmAudienceCount === -1 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-yellow-800">Could not preview audience count. Proceed with caution.</p>
                  </div>
                ) : null}

                <p className="text-xs text-gray-500 mb-4">This action cannot be undone.</p>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setConfirmSendCampaign(null)}
                    disabled={sendingCampaignId === confirmSendCampaign.id}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const campaignId = confirmSendCampaign.id
                      setSendingCampaignId(campaignId)
                      try {
                        await sendCampaign(campaignId)
                        setConfirmSendCampaign(null)
                        campaigns.refetch()
                      } catch {
                        // Campaign will show as failed after refetch
                        setConfirmSendCampaign(null)
                        campaigns.refetch()
                      } finally {
                        setSendingCampaignId(null)
                      }
                    }}
                    disabled={sendingCampaignId !== null || confirmLoading}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {sendingCampaignId === confirmSendCampaign.id && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirm Send
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Notifications */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Notification Templates</h2>
              <p className="text-sm text-gray-500">Click a template to edit</p>
            </div>
            <DataTable
              data={templates.data}
              columns={templateColumns}
              keyField="id"
              loading={templates.isLoading}
              emptyMessage="No templates found. Run the seed migration first."
              actions={[
                {
                  label: 'Edit',
                  onClick: (row) => navigate(`/admin/email/template/${row.id}`),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* Tab: User Engagement */}
      {activeTab === 'engagement' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Template:</label>
              <select
                value={engTemplateKey}
                onChange={(e) => { setEngTemplateKey(e.target.value); setEngPage(0) }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All</option>
                {templates.data.map(t => (
                  <option key={t.template_key} value={t.template_key}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Status:</label>
              <select
                value={engStatus}
                onChange={(e) => { setEngStatus(e.target.value); setEngPage(0) }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All</option>
                <option value="delivered_not_opened">Delivered (not opened)</option>
                <option value="opened_not_clicked">Opened (not clicked)</option>
                <option value="clicked">Clicked</option>
                <option value="bounced">Bounced</option>
                <option value="unsubscribed">Unsubscribed</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Role:</label>
              <select
                value={engRole}
                onChange={(e) => { setEngRole(e.target.value); setEngPage(0) }}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All</option>
                <option value="player">Player</option>
                <option value="coach">Coach</option>
                <option value="club">Club</option>
                <option value="brand">Brand</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <DataTable
              data={engagement.data}
              columns={engagementColumns}
              keyField="send_id"
              loading={engagement.isLoading}
              emptyMessage="No email sends found matching the filters"
              pagination={{
                page: engPage,
                pageSize: 50,
                totalCount: engagement.totalCount,
                onPageChange: setEngPage,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
