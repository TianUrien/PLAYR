/**
 * AdminPlayers Page
 * 
 * Player analytics dashboard showing journey funnel and profile completeness.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Users,
  RefreshCw,
  Video,
  FileText,
  Image,
  UserCheck,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { getPlayerFunnel, getProfileCompletenessDistribution, getExtendedDashboardStats } from '../api/adminApi'
import type { PlayerFunnel, ProfileCompletenessDistribution, ExtendedDashboardStats } from '../types'
import { logger } from '@/lib/logger'

type DaysFilter = 7 | 30 | 90 | null

export function AdminPlayers() {
  const [funnel, setFunnel] = useState<PlayerFunnel | null>(null)
  const [distribution, setDistribution] = useState<ProfileCompletenessDistribution[]>([])
  const [stats, setStats] = useState<ExtendedDashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [daysFilter, setDaysFilter] = useState<DaysFilter>(30)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const [funnelData, distData, statsData] = await Promise.all([
        getPlayerFunnel(daysFilter ?? undefined),
        getProfileCompletenessDistribution('player'),
        getExtendedDashboardStats(),
      ])
      
      setFunnel(funnelData)
      setDistribution(distData)
      setStats(statsData)
    } catch (err) {
      logger.error('[AdminPlayers] Failed to fetch data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load player data')
    } finally {
      setIsLoading(false)
    }
  }, [daysFilter])

  useEffect(() => {
    document.title = 'Player Analytics | PLAYR Admin'
    fetchData()
  }, [fetchData])

  const getFunnelPercentage = (value: number, total: number): number => {
    if (!total) return 0
    return Math.round((value / total) * 100)
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load player data</h2>
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  const signedUp = funnel?.signed_up ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Player Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitor player journey funnel and profile completeness
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Players with Video"
          value={stats?.players_with_video ?? 0}
          icon={Video}
          color="purple"
          loading={isLoading}
          trend={stats?.players_with_video_pct ? {
            value: stats.players_with_video_pct,
            label: 'of all players',
            direction: 'up',
          } : undefined}
        />
        <StatCard
          label="Applied (Ever)"
          value={stats?.players_applied_ever ?? 0}
          icon={FileText}
          color="blue"
          loading={isLoading}
        />
        <StatCard
          label="Applied (7d)"
          value={stats?.players_applied_7d ?? 0}
          icon={TrendingUp}
          color="green"
          loading={isLoading}
        />
        <StatCard
          label="Avg Profile Score"
          value={`${stats?.avg_profile_score ?? 0}%`}
          icon={UserCheck}
          color="amber"
          loading={isLoading}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-200">
        <label className="text-sm text-gray-600">Funnel period:</label>
        <select
          id="funnel-period-filter"
          aria-label="Filter funnel by time period"
          value={daysFilter ?? 'all'}
          onChange={(e) => {
            const val = e.target.value
            setDaysFilter(val === 'all' ? null : Number(val) as DaysFilter)
          }}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Journey Funnel */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Player Journey Funnel</h2>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {[
              { label: 'Signed Up', value: funnel?.signed_up ?? 0, icon: Users, color: 'purple' },
              { label: 'Onboarding Complete', value: funnel?.onboarding_completed ?? 0, icon: UserCheck, color: 'blue' },
              { label: 'Has Avatar', value: funnel?.has_avatar ?? 0, icon: Image, color: 'indigo' },
              { label: 'Has Video Highlight', value: funnel?.has_video ?? 0, icon: Video, color: 'violet' },
              { label: 'Has Journey Entry', value: funnel?.has_journey_entry ?? 0, icon: FileText, color: 'pink' },
              { label: 'Has Gallery Photo', value: funnel?.has_gallery_photo ?? 0, icon: Image, color: 'rose' },
              { label: 'Applied to Vacancy', value: funnel?.applied_to_vacancy ?? 0, icon: FileText, color: 'green' },
            ].map(({ label, value, icon: Icon, color }, index) => {
              const percentage = getFunnelPercentage(value, signedUp)
              const widthPct = Math.max(percentage, 5) // Minimum 5% width for visibility
              
              return (
                <div key={label} className="relative">
                  <div className="flex items-center gap-4">
                    <div className="w-40 flex items-center gap-2">
                      <Icon className={`w-4 h-4 text-${color}-600`} />
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                    </div>
                    <div className="flex-1">
                      <div className="relative h-10 bg-gray-100 rounded-lg overflow-hidden">
                        {/* Dynamic width required for data visualization */}
                        <div
                          className={`absolute left-0 top-0 h-full bg-${color}-500 transition-all duration-500`}
                          style={{ width: `${widthPct}%` }}
                        />
                        <div className="absolute inset-0 flex items-center justify-between px-3">
                          <span className="text-sm font-bold text-white mix-blend-difference">
                            {value.toLocaleString()}
                          </span>
                          <span className="text-sm font-medium text-gray-600">
                            {percentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {index > 0 && (
                    <div className="absolute -top-2 left-20 text-xs text-gray-400">
                      ↓ {getFunnelPercentage(value, [
                        funnel?.signed_up ?? 0,
                        funnel?.onboarding_completed ?? 0,
                        funnel?.has_avatar ?? 0,
                        funnel?.has_video ?? 0,
                        funnel?.has_journey_entry ?? 0,
                        funnel?.has_gallery_photo ?? 0,
                      ][index - 1] || 1)}% conversion
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Profile Completeness Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Profile Completeness Distribution</h2>
        
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {distribution.map(({ bucket, count, percentage }) => {
              const colorMap: Record<string, string> = {
                '0-25%': 'red',
                '26-50%': 'amber',
                '51-75%': 'blue',
                '76-100%': 'green',
              }
              const color = colorMap[bucket] || 'gray'
              
              return (
                <div key={bucket} className="flex items-center gap-4">
                  <div className="w-24">
                    <span className="text-sm font-medium text-gray-700">{bucket}</span>
                  </div>
                  <div className="flex-1">
                    <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                      {/* Dynamic width required for data visualization */}
                      <div
                        className={`absolute left-0 top-0 h-full bg-${color}-500 transition-all duration-500`}
                        style={{ width: `${Math.max(percentage, 2)}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-between px-3">
                        <span className="text-sm font-bold text-white mix-blend-difference">
                          {count.toLocaleString()} players
                        </span>
                        <span className="text-sm font-medium text-gray-600">
                          {percentage}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Summary */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-sm text-gray-500">Onboarding Rate</p>
              <p className="text-xl font-bold text-gray-900">{stats?.onboarding_rate ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">With Video</p>
              <p className="text-xl font-bold text-gray-900">{stats?.players_with_video_pct ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Score</p>
              <p className="text-xl font-bold text-gray-900">{stats?.avg_profile_score ?? 0}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Ever Applied</p>
              <p className="text-xl font-bold text-gray-900">{stats?.players_applied_ever ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Insights */}
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/80 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Video Upload Rate</p>
            <p className="text-2xl font-bold text-purple-600">
              {funnel && funnel.signed_up > 0 
                ? Math.round((funnel.has_video / funnel.signed_up) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of signed up players have added a highlight video
            </p>
          </div>
          <div className="bg-white/80 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Application Rate</p>
            <p className="text-2xl font-bold text-green-600">
              {funnel && funnel.onboarding_completed > 0 
                ? Math.round((funnel.applied_to_vacancy / funnel.onboarding_completed) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of onboarded players have applied to at least one vacancy
            </p>
          </div>
          <div className="bg-white/80 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Onboarding Drop-off</p>
            <p className="text-2xl font-bold text-amber-600">
              {funnel && funnel.signed_up > 0 
                ? Math.round(((funnel.signed_up - funnel.onboarding_completed) / funnel.signed_up) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of players signed up but didn't complete onboarding
            </p>
          </div>
          <div className="bg-white/80 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-1">Journey Completion</p>
            <p className="text-2xl font-bold text-blue-600">
              {funnel && funnel.onboarding_completed > 0 
                ? Math.round((funnel.has_journey_entry / funnel.onboarding_completed) * 100)
                : 0}%
            </p>
            <p className="text-xs text-gray-500 mt-1">
              of onboarded players have added journey entries
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
