/**
 * AdminWorld Page
 * 
 * Admin Portal page for managing Hockey World clubs.
 * Features: stats cards, filters, paginated table, edit/add modals.
 */

import { useState, useEffect, useCallback } from 'react'
import { 
  Globe2, 
  Search, 
  Plus, 
  Pencil, 
  ChevronLeft, 
  ChevronRight,
  UserX,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { StatCard } from '../components/StatCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EditWorldClubModal } from '../components/EditWorldClubModal'
import {
  getWorldClubs,
  getWorldClubStats,
  getWorldCountries,
  getWorldProvinces,
  unclaimWorldClub,
} from '../api/adminApi'
import type { 
  WorldClub, 
  WorldClubStats, 
  WorldClubFilters,
  WorldCountry,
  WorldProvince,
} from '../types'
import { logger } from '@/lib/logger'

const PAGE_SIZE = 25

export default function AdminWorld() {
  // Data state
  const [clubs, setClubs] = useState<WorldClub[]>([])
  const [stats, setStats] = useState<WorldClubStats | null>(null)
  const [countries, setCountries] = useState<WorldCountry[]>([])
  const [provinces, setProvinces] = useState<WorldProvince[]>([])
  const [totalCount, setTotalCount] = useState(0)

  // Filter state
  const [filters, setFilters] = useState<WorldClubFilters>({})
  const [searchInput, setSearchInput] = useState('')

  // Pagination
  const [page, setPage] = useState(0)

  // Loading states
  const [loadingClubs, setLoadingClubs] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingCountries, setLoadingCountries] = useState(true)
  const [loadingProvinces, setLoadingProvinces] = useState(false)

  // Modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [selectedClub, setSelectedClub] = useState<WorldClub | null>(null)
  
  // Unclaim confirm dialog
  const [unclaimDialogOpen, setUnclaimDialogOpen] = useState(false)
  const [clubToUnclaim, setClubToUnclaim] = useState<WorldClub | null>(null)
  const [isUnclaiming, setIsUnclaiming] = useState(false)

  const loadStats = useCallback(async () => {
    setLoadingStats(true)
    try {
      const data = await getWorldClubStats()
      setStats(data)
    } catch (err) {
      logger.error('[AdminWorld] Failed to load stats:', err)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const loadCountries = useCallback(async () => {
    setLoadingCountries(true)
    try {
      const data = await getWorldCountries()
      setCountries(data)
    } catch (err) {
      logger.error('[AdminWorld] Failed to load countries:', err)
    } finally {
      setLoadingCountries(false)
    }
  }, [])

  const loadProvinces = useCallback(async (countryId: number) => {
    setLoadingProvinces(true)
    try {
      const data = await getWorldProvinces(countryId)
      setProvinces(data)
    } catch (err) {
      logger.error('[AdminWorld] Failed to load provinces:', err)
      setProvinces([])
    } finally {
      setLoadingProvinces(false)
    }
  }, [])

  const loadClubs = useCallback(async () => {
    setLoadingClubs(true)
    try {
      const { clubs: data, totalCount: count } = await getWorldClubs(filters, PAGE_SIZE, page * PAGE_SIZE)
      setClubs(data)
      setTotalCount(count)
    } catch (err) {
      logger.error('[AdminWorld] Failed to load clubs:', err)
    } finally {
      setLoadingClubs(false)
    }
  }, [filters, page])

  // Load initial data
  useEffect(() => {
    loadStats()
    loadCountries()
  }, [loadStats, loadCountries])

  // Load clubs when filters or page changes
  useEffect(() => {
    loadClubs()
  }, [loadClubs])

  // Load provinces when country filter changes
  useEffect(() => {
    if (filters.country_id) {
      loadProvinces(filters.country_id)
    } else {
      setProvinces([])
    }
  }, [filters.country_id, loadProvinces])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => ({ ...prev, search: searchInput || undefined }))
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleFilterChange = (key: keyof WorldClubFilters, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
      // Clear province when country changes
      ...(key === 'country_id' ? { province_id: undefined } : {}),
    }))
    setPage(0)
  }

  const handleAddClub = () => {
    setSelectedClub(null)
    setEditModalOpen(true)
  }

  const handleEditClub = (club: WorldClub) => {
    setSelectedClub(club)
    setEditModalOpen(true)
  }

  const handleUnclaimClick = (club: WorldClub) => {
    setClubToUnclaim(club)
    setUnclaimDialogOpen(true)
  }

  const handleUnclaimConfirm = async () => {
    if (!clubToUnclaim) return
    
    setIsUnclaiming(true)
    try {
      await unclaimWorldClub(clubToUnclaim.id)
      setUnclaimDialogOpen(false)
      setClubToUnclaim(null)
      // Refresh data
      loadClubs()
      loadStats()
    } catch (err) {
      logger.error('[AdminWorld] Failed to unclaim:', err)
    } finally {
      setIsUnclaiming(false)
    }
  }

  const handleCloseUnclaimDialog = () => {
    setUnclaimDialogOpen(false)
    setClubToUnclaim(null)
  }

  const handleModalSaved = () => {
    loadClubs()
    loadStats()
  }

  const handleRefresh = () => {
    loadClubs()
    loadStats()
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe2 className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hockey World</h1>
            <p className="text-sm text-gray-500">Manage world clubs directory</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={handleAddClub}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Club
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Total Clubs"
          value={stats?.total_clubs ?? '-'}
          loading={loadingStats}
          icon={Globe2}
        />
        <StatCard
          label="Claimed"
          value={stats?.claimed_clubs ?? '-'}
          loading={loadingStats}
          icon={CheckCircle}
          color="green"
        />
        <StatCard
          label="Unclaimed"
          value={stats?.unclaimed_clubs ?? '-'}
          loading={loadingStats}
          icon={XCircle}
          color="gray"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <label htmlFor="world-search" className="block text-xs font-medium text-gray-500 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                id="world-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Club name or ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="world-country" className="block text-xs font-medium text-gray-500 mb-1">Country</label>
            <select
              id="world-country"
              value={filters.country_id ?? ''}
              onChange={(e) => handleFilterChange('country_id', e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loadingCountries}
            >
              <option value="">All countries</option>
              {countries.map(c => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Region */}
          <div>
            <label htmlFor="world-region" className="block text-xs font-medium text-gray-500 mb-1">Region</label>
            <select
              id="world-region"
              value={filters.province_id ?? ''}
              onChange={(e) => handleFilterChange('province_id', e.target.value ? parseInt(e.target.value, 10) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={!filters.country_id || loadingProvinces}
            >
              <option value="">All regions</option>
              {provinces.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Claimed Status */}
          <div>
            <label htmlFor="world-claimed" className="block text-xs font-medium text-gray-500 mb-1">Claimed</label>
            <select
              id="world-claimed"
              value={filters.is_claimed === undefined ? '' : filters.is_claimed ? 'yes' : 'no'}
              onChange={(e) => handleFilterChange('is_claimed', e.target.value === '' ? undefined : e.target.value === 'yes')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All</option>
              <option value="yes">Claimed only</option>
              <option value="no">Unclaimed only</option>
            </select>
          </div>

          {/* Created From */}
          <div>
            <label htmlFor="world-source" className="block text-xs font-medium text-gray-500 mb-1">Source</label>
            <select
              id="world-source"
              value={filters.created_from ?? ''}
              onChange={(e) => handleFilterChange('created_from', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All sources</option>
              <option value="seed">Seed Data</option>
              <option value="admin">Admin Created</option>
              <option value="user">User Created</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Club
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Country
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Region
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Women's League
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Men's League
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Claimed By
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingClubs ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-600" />
                    <p className="mt-2 text-sm text-gray-500">Loading clubs...</p>
                  </td>
                </tr>
              ) : clubs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    No clubs found matching your filters
                  </td>
                </tr>
              ) : (
                clubs.map((club) => (
                  <tr key={club.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{club.club_name}</p>
                        <p className="text-xs text-gray-500">ID: {club.club_id}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {club.country_flag_emoji ?? ''} {club.country_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {club.province_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {club.women_league_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {club.men_league_name || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {club.is_claimed && club.claimed_profile_id ? (
                        <a
                          href={`/admin/directory?search=${club.claimed_profile_id}`}
                          className="inline-flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700"
                        >
                          <span className="truncate max-w-[120px]">
                            {club.claimed_profile_name || club.claimed_profile_id.slice(0, 8)}
                          </span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        club.created_from === 'admin' 
                          ? 'bg-purple-100 text-purple-700'
                          : club.created_from === 'seed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {club.created_from}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEditClub(club)}
                          className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Edit club"
                          aria-label={`Edit ${club.club_name}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {club.is_claimed && (
                          <button
                            onClick={() => handleUnclaimClick(club)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Unclaim club"
                            aria-label={`Unclaim ${club.club_name}`}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loadingClubs && totalCount > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} clubs
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      <EditWorldClubModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSaved={handleModalSaved}
        club={selectedClub}
      />

      {/* Unclaim Confirm Dialog */}
      <ConfirmDialog
        isOpen={unclaimDialogOpen}
        title="Unclaim Club"
        message={
          clubToUnclaim
            ? `Are you sure you want to unclaim "${clubToUnclaim.club_name}"? This will remove the link to the profile "${clubToUnclaim.claimed_profile_name || clubToUnclaim.claimed_profile_id}".`
            : ''
        }
        confirmLabel="Unclaim"
        variant="danger"
        onConfirm={handleUnclaimConfirm}
        onClose={handleCloseUnclaimDialog}
        loading={isUnclaiming}
      />
    </div>
  )
}
