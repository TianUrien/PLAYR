import { useState, useEffect, useCallback } from 'react'
import { Grid, List, ChevronDown, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../lib/auth'
import type { Vacancy } from '../lib/supabase'
import Header from '../components/Header'
import VacancyCard from '../components/VacancyCard'
import VacancyDetailView from '../components/VacancyDetailView'
import ApplyToVacancyModal from '../components/ApplyToVacancyModal'
import Button from '../components/Button'
import { VacancyCardSkeleton } from '../components/Skeleton'
import { requestCache } from '@/lib/requestCache'
import { monitor } from '@/lib/monitor'
import { logger } from '@/lib/logger'

interface FiltersState {
  opportunityType: 'all' | 'player' | 'coach'
  position: string[]
  gender: 'all' | 'Men' | 'Women'
  location: string
  startDate: 'all' | 'immediate' | 'specific'
  benefits: string[]
  priority: 'all' | 'high' | 'medium' | 'low'
}

const POSITIONS = ['goalkeeper', 'defender', 'midfielder', 'forward']
const BENEFITS = ['housing', 'car', 'visa', 'flights', 'meals', 'job', 'insurance', 'education', 'bonuses', 'equipment']

export default function OpportunitiesPage() {
  const { user, profile } = useAuthStore()
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [filteredVacancies, setFilteredVacancies] = useState<Vacancy[]>([])
  const [clubs, setClubs] = useState<Record<string, { id: string; full_name: string; avatar_url: string | null }>>({})
  const [userApplications, setUserApplications] = useState<string[]>([])
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [showDetailView, setShowDetailView] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'newest'>('newest')
  const [showFilters, setShowFilters] = useState(false)
  
  const [filters, setFilters] = useState<FiltersState>({
    opportunityType: 'all',
    position: [],
    gender: 'all',
    location: '',
    startDate: 'all',
    benefits: [],
    priority: 'all',
  })

  const fetchVacancies = useCallback(async () => {
    setIsLoading(true)
    
    await monitor.measure('fetch_vacancies', async () => {
      try {
        const { vacanciesData, clubsMap } = await requestCache.dedupe(
          'open-vacancies',
          async () => {
            // Fetch vacancies with club data in a single query using JOIN
            const { data: vacanciesData, error: vacanciesError } = await supabase
              .from('vacancies')
              .select(`
                *,
                club:profiles!vacancies_club_id_fkey(
                  id,
                  full_name,
                  avatar_url
                )
              `)
              .eq('status', 'open')
              .order('created_at', { ascending: false })
              .limit(100) // Limit to 100 most recent vacancies

            if (vacanciesError) throw vacanciesError

            logger.debug('Fetched vacancies with clubs:', vacanciesData)

            // Build clubs map from embedded data
            const clubsMap: Record<string, { id: string; full_name: string; avatar_url: string | null }> = {}
            
            vacanciesData?.forEach((vacancy: Vacancy & { club?: { id: string; full_name: string | null; avatar_url: string | null } }) => {
              if (vacancy.club && vacancy.club.id) {
                clubsMap[vacancy.club.id] = {
                  id: vacancy.club.id,
                  full_name: vacancy.club.full_name || 'Unknown Club',
                  avatar_url: vacancy.club.avatar_url,
                }
              }
            })

            logger.debug('Clubs map:', clubsMap)

            return { vacanciesData, clubsMap }
          },
          5000 // 5 second cache for vacancies (reduced from 20s)
        )

        setVacancies((vacanciesData as Vacancy[]) || [])
        setClubs(clubsMap)
      } catch (error) {
        logger.error('Error fetching vacancies:', error)
      } finally {
        setIsLoading(false)
      }
    })
  }, [])

  const fetchUserApplications = useCallback(async (options?: { skipCache?: boolean }) => {
    if (!user || (profile?.role !== 'player' && profile?.role !== 'coach')) return

    await monitor.measure('fetch_user_applications', async () => {
      const cacheKey = `user-applications-${user.id}`
      const shouldSkipCache = options?.skipCache === true
      
      try {
        if (shouldSkipCache) {
          requestCache.invalidate(cacheKey)
        }

        const appliedVacancyIds = await requestCache.dedupe(
          cacheKey,
          async () => {
            const { data, error } = await supabase
              .from('vacancy_applications')
              .select('vacancy_id')
              .eq('player_id', user.id)

            if (error) throw error

            return (data as { vacancy_id: string }[])?.map(app => app.vacancy_id) || []
          },
          shouldSkipCache ? 0 : 30000 // disable cache when explicitly requested
        )

        setUserApplications(appliedVacancyIds)
      } catch (error) {
        logger.error('Error fetching user applications:', error)
      }
    }, { userId: user.id })
  }, [user, profile])

  useEffect(() => {
    fetchVacancies()
    fetchUserApplications()
  }, [fetchVacancies, fetchUserApplications])

  // Apply filters
  useEffect(() => {
    let filtered = [...vacancies]

    // Opportunity type filter
    if (filters.opportunityType !== 'all') {
      filtered = filtered.filter(v => v.opportunity_type === filters.opportunityType)
    }

    // Position filter
    if (filters.position.length > 0) {
      filtered = filtered.filter(v => {
        if (!v.position) return false
        const vacancyPosition = v.position.toLowerCase()
        return filters.position.includes(vacancyPosition)
      })
    }

    // Gender filter
    if (filters.gender !== 'all') {
      filtered = filtered.filter(v => v.gender === filters.gender)
    }

    // Location filter
    if (filters.location.trim()) {
      const locationLower = filters.location.toLowerCase()
      filtered = filtered.filter(v => {
        const city = v.location_city?.toLowerCase() ?? ''
        const country = v.location_country?.toLowerCase() ?? ''
        return city.includes(locationLower) || country.includes(locationLower)
      })
    }

    // Start date filter
    if (filters.startDate === 'immediate') {
      filtered = filtered.filter(v => !v.start_date)
    } else if (filters.startDate === 'specific') {
      filtered = filtered.filter(v => v.start_date)
    }

    // Benefits filter
    if (filters.benefits.length > 0) {
      filtered = filtered.filter(v =>
        v.benefits && filters.benefits.some(benefit => v.benefits?.includes(benefit))
      )
    }

    // Priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(v => v.priority === filters.priority)
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
        return dateB - dateA
      })
    }

    setFilteredVacancies(filtered)
  }, [vacancies, filters, sortBy])

  const updateFilter = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value } as FiltersState
      if (key === 'opportunityType') {
        next.position = []
        next.gender = 'all'
      }
      return next
    })
  }

  const togglePosition = (position: string) => {
    setFilters(prev => ({
      ...prev,
      position: prev.position.includes(position)
        ? prev.position.filter(p => p !== position)
        : [...prev.position, position]
    }))
  }

  const toggleBenefit = (benefit: string) => {
    setFilters(prev => ({
      ...prev,
      benefits: prev.benefits.includes(benefit)
        ? prev.benefits.filter(b => b !== benefit)
        : [...prev.benefits, benefit]
    }))
  }

  const clearFilters = () => {
    setFilters({
      opportunityType: 'all',
      position: [],
      gender: 'all',
      location: '',
      startDate: 'all',
      benefits: [],
      priority: 'all',
    })
  }

  const hasActiveFilters = () => {
    return (
      filters.opportunityType !== 'all' ||
      filters.position.length > 0 ||
      filters.gender !== 'all' ||
      filters.location.trim() !== '' ||
      filters.startDate !== 'all' ||
      filters.benefits.length > 0 ||
      filters.priority !== 'all'
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Opportunities
          </h1>
          <p className="text-gray-600">
            Discover field hockey opportunities from clubs around the world
          </p>
        </div>

        {/* Controls Bar */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            {/* Results & Filters Toggle */}
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{filteredVacancies.length}</span> opportunities
              </p>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="md:hidden flex items-center gap-2 px-4 py-2.5 min-h-[44px] text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Filter className="w-4 h-4" />
                Filters
                {hasActiveFilters() && (
                  <span className="w-2 h-2 bg-blue-600 rounded-full" />
                )}
              </button>
            </div>

            {/* Sort & View Toggle */}
            <div className="flex items-center gap-3">
              {/* Sort */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'newest')}
                  className="appearance-none pl-4 pr-10 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  title="Sort by"
                >
                  <option value="newest">Newest</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              </div>

              {/* View Toggle */}
              <div className="hidden md:flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                  title="Grid view"
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}
                  title="List view"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Filters Panel - Desktop */}
          <aside className={`${showFilters ? 'block' : 'hidden'} md:block w-full md:w-72 flex-shrink-0`}>
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Filters</h2>
                {hasActiveFilters() && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Clear all
                  </button>
                )}
              </div>

              {/* Opportunity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Role Type
                </label>
                <div className="space-y-2">
                  {(['all', 'player', 'coach'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={filters.opportunityType === type}
                        onChange={() => updateFilter('opportunityType', type)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">{type === 'all' ? 'All' : type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Position */}
              {filters.opportunityType !== 'coach' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position
                  </label>
                  <div className="space-y-2">
                    {POSITIONS.map((position) => (
                      <label key={position} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.position.includes(position)}
                          onChange={() => togglePosition(position)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <span className="text-sm text-gray-700 capitalize">{position}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Gender */}
              {filters.opportunityType !== 'coach' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <div className="space-y-2">
                    {(['all', 'Men', 'Women'] as const).map((gender) => (
                      <label key={gender} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={filters.gender === gender}
                          onChange={() => updateFilter('gender', gender)}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm text-gray-700">{gender === 'all' ? 'All' : gender}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={filters.location}
                  onChange={(e) => updateFilter('location', e.target.value)}
                  placeholder="City or Country"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <div className="space-y-2">
                  {(['all', 'immediate', 'specific'] as const).map((start) => (
                    <label key={start} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={filters.startDate === start}
                        onChange={() => updateFilter('startDate', start)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">
                        {start === 'all' ? 'All' : start === 'immediate' ? 'Immediate' : 'Scheduled'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Benefits */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Benefits
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {BENEFITS.map((benefit) => (
                    <label key={benefit} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.benefits.includes(benefit)}
                        onChange={() => toggleBenefit(benefit)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm text-gray-700 capitalize">{benefit}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <div className="space-y-2">
                  {(['all', 'high', 'medium', 'low'] as const).map((priority) => (
                    <label key={priority} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={filters.priority === priority}
                        onChange={() => updateFilter('priority', priority)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700 capitalize">{priority === 'all' ? 'All' : priority}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <VacancyCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredVacancies.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔍</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No opportunities found
                </h3>
                <p className="text-gray-600 mb-6">
                  {hasActiveFilters()
                    ? 'Try adjusting your filters to see more results'
                    : 'No opportunities are currently available'}
                </p>
                {hasActiveFilters() && (
                  <Button onClick={clearFilters} className="mx-auto">
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 gap-6' : 'space-y-4'}>
                {filteredVacancies.map((vacancy) => {
                  const club = clubs[vacancy.club_id]
                  const isApplied = userApplications.includes(vacancy.id)
                  return (
                    <VacancyCard
                      key={vacancy.id}
                      vacancy={vacancy}
                      clubName={club?.full_name || 'Unknown Club'}
                      clubLogo={club?.avatar_url || null}
                      clubId={vacancy.club_id}
                      onViewDetails={() => {
                        setSelectedVacancy(vacancy)
                        setShowDetailView(true)
                      }}
                      onApply={
                        user && (profile?.role === 'player' || profile?.role === 'coach') && !isApplied
                          ? () => {
                              setSelectedVacancy(vacancy)
                              setShowApplyModal(true)
                            }
                          : undefined
                      }
                      hasApplied={isApplied}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Vacancy Detail View */}
      {selectedVacancy && showDetailView && (
        <VacancyDetailView
          vacancy={selectedVacancy}
          clubName={clubs[selectedVacancy.club_id]?.full_name || 'Unknown Club'}
          clubLogo={clubs[selectedVacancy.club_id]?.avatar_url || null}
          clubId={selectedVacancy.club_id}
          onClose={() => {
            setShowDetailView(false)
            setSelectedVacancy(null)
          }}
          onApply={
            user && (profile?.role === 'player' || profile?.role === 'coach') && !userApplications.includes(selectedVacancy.id)
              ? () => {
                  setShowDetailView(false)
                  setShowApplyModal(true)
                }
              : undefined
          }
          hasApplied={userApplications.includes(selectedVacancy.id)}
        />
      )}

      {/* Apply Modal */}
      {selectedVacancy && (
        <ApplyToVacancyModal
          isOpen={showApplyModal}
          onClose={() => {
            setShowApplyModal(false)
            // Don't clear selectedVacancy immediately - let it persist for the render
            setTimeout(() => setSelectedVacancy(null), 100)
          }}
          vacancy={selectedVacancy}
          onSuccess={(vacancyId) => {
            setUserApplications(prev => {
              if (prev.includes(vacancyId)) {
                return prev
              }
              return [...prev, vacancyId]
            })
            fetchUserApplications({ skipCache: true })
          }}
          onError={(vacancyId) => {
            setUserApplications(prev => prev.filter(id => id !== vacancyId))
            fetchUserApplications({ skipCache: true })
          }}
        />
      )}
    </div>
  )
}
