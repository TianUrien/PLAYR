/**
 * AdminOverview Page
 * 
 * Dashboard showing key metrics and KPIs for the admin portal.
 */

import { useEffect } from 'react'
import { formatAdminDateTime } from '../utils/formatDate'
import { Link } from 'react-router-dom'
import {
  Users,
  UserCheck,
  Building2,
  Briefcase,
  FileText,
  MessageSquare,
  UserX,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Store,
  Package,
} from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { useAdminStats } from '../hooks/useAdminStats'

export function AdminOverview() {
  const { stats, signupTrends, topCountries, isLoading, error, refetch } = useAdminStats()

  useEffect(() => {
    document.title = 'Admin Overview | PLAYR'
  }, [])

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load dashboard</h2>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={refetch}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Calculate 7-day trends from signup data
  const recent7dSignups = signupTrends.slice(-7).reduce((sum, d) => sum + d.total_signups, 0)
  const previous7dSignups = signupTrends.slice(-14, -7).reduce((sum, d) => sum + d.total_signups, 0)
  const signupTrend = previous7dSignups > 0 ? ((recent7dSignups - previous7dSignups) / previous7dSignups * 100).toFixed(0) : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform metrics and health at a glance
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* User Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Users</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Total Users"
            value={stats?.total_users ?? 0}
            icon={Users}
            color="purple"
            loading={isLoading}
            trend={
              signupTrend !== 0
                ? {
                    value: Number(signupTrend),
                    label: 'vs last 7d',
                    direction: Number(signupTrend) > 0 ? 'up' : 'down',
                  }
                : undefined
            }
          />
          <StatCard
            label="Players"
            value={stats?.total_players ?? 0}
            icon={UserCheck}
            color="blue"
            loading={isLoading}
          />
          <StatCard
            label="Coaches"
            value={stats?.total_coaches ?? 0}
            icon={UserCheck}
            color="green"
            loading={isLoading}
          />
          <StatCard
            label="Clubs"
            value={stats?.total_clubs ?? 0}
            icon={Building2}
            color="amber"
            loading={isLoading}
          />
          <StatCard
            label="Brands"
            value={stats?.total_brands ?? 0}
            icon={Store}
            color="purple"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Signups */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Signups</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Last 7 Days"
            value={stats?.signups_7d ?? 0}
            icon={TrendingUp}
            color="purple"
            loading={isLoading}
          />
          <StatCard
            label="Last 30 Days"
            value={stats?.signups_30d ?? 0}
            icon={TrendingUp}
            color="blue"
            loading={isLoading}
          />
          <StatCard
            label="Onboarding Complete"
            value={stats?.onboarding_completed ?? 0}
            icon={UserCheck}
            color="green"
            loading={isLoading}
          />
          <StatCard
            label="Onboarding Pending"
            value={stats?.onboarding_pending ?? 0}
            icon={UserX}
            color="amber"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Content Metrics */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Content</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Vacancies"
            value={stats?.total_vacancies ?? 0}
            icon={Briefcase}
            color="purple"
            loading={isLoading}
          />
          <StatCard
            label="Open Vacancies"
            value={stats?.open_vacancies ?? 0}
            icon={Briefcase}
            color="green"
            loading={isLoading}
          />
          <StatCard
            label="Total Applications"
            value={stats?.total_applications ?? 0}
            icon={FileText}
            color="blue"
            loading={isLoading}
          />
          <StatCard
            label="Applications (7d)"
            value={stats?.applications_7d ?? 0}
            icon={FileText}
            color="amber"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Brands */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Brands</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Brands"
            value={stats?.total_brands ?? 0}
            icon={Store}
            color="purple"
            loading={isLoading}
          />
          <StatCard
            label="New Brands (7d)"
            value={stats?.brands_7d ?? 0}
            icon={TrendingUp}
            color="blue"
            loading={isLoading}
          />
          <StatCard
            label="Brand Products"
            value={stats?.total_brand_products ?? 0}
            icon={Package}
            color="green"
            loading={isLoading}
          />
          <StatCard
            label="Brand Posts"
            value={stats?.total_brand_posts ?? 0}
            icon={FileText}
            color="amber"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Engagement */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Engagement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Conversations"
            value={stats?.total_conversations ?? 0}
            icon={MessageSquare}
            color="purple"
            loading={isLoading}
          />
          <StatCard
            label="Messages (7d)"
            value={stats?.messages_7d ?? 0}
            icon={MessageSquare}
            color="blue"
            loading={isLoading}
          />
          <StatCard
            label="Friendships"
            value={stats?.total_friendships ?? 0}
            icon={Users}
            color="green"
            loading={isLoading}
          />
          <StatCard
            label="Blocked Users"
            value={stats?.blocked_users ?? 0}
            icon={UserX}
            color="red"
            loading={isLoading}
          />
        </div>
      </section>

      {/* Data Health */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Data Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            to="/admin/data-issues"
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">Auth Orphans</span>
              <div className="p-2 rounded-lg bg-red-50">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse" />
              ) : (
                stats?.auth_orphans ?? 0
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Users without profiles</p>
          </Link>

          <Link
            to="/admin/data-issues"
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">Profile Orphans</span>
              <div className="p-2 rounded-lg bg-amber-50">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse" />
              ) : (
                stats?.profile_orphans ?? 0
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Profiles without auth users</p>
          </Link>

          <Link
            to="/admin/data-issues"
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500">Test Accounts</span>
              <div className="p-2 rounded-lg bg-purple-50">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {isLoading ? (
                <span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse" />
              ) : (
                stats?.test_accounts ?? 0
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Marked as test data</p>
          </Link>
        </div>
      </section>

      {/* Top Countries */}
      {topCountries.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Countries</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Country
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Users
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topCountries.map((country, index) => (
                  <tr key={country.country} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <span className="mr-2">{index + 1}.</span>
                      {country.country}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 text-right">
                      {country.user_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Last updated */}
      {stats?.generated_at && (
        <p className="text-xs text-gray-400 text-center">
          Last updated: {formatAdminDateTime(stats.generated_at)}
        </p>
      )}
    </div>
  )
}
