/**
 * PeopleListView
 * 
 * The People mode view for the Community page.
 * Displays a searchable, filterable member directory.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { MemberCard } from '@/components'
import { ProfileCardSkeleton } from '@/components/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/auth'
import { requestCache } from '@/lib/requestCache'
import { monitor } from '@/lib/monitor'

interface Profile {
  id: string
  avatar_url: string | null
  full_name: string
  role: 'player' | 'coach' | 'club'
  nationality: string | null
  nationality_country_id: number | null
  nationality2_country_id: number | null
  base_location: string | null
  position: string | null
  secondary_position: string | null
  current_club: string | null
  created_at: string
  is_test_account?: boolean
  open_to_play?: boolean
  open_to_coach?: boolean
}

type RoleFilter = 'all' | 'player' | 'coach' | 'club'
type AvailabilityFilter = 'all' | 'open'

export function PeopleListView() {
  const { profile: currentUserProfile } = useAuthStore()
  const isCurrentUserTestAccount = currentUserProfile?.is_test_account ?? false
  
  const [baseMembers, setBaseMembers] = useState<Profile[]>([])
  const [allMembers, setAllMembers] = useState<Profile[]>([])
  const [displayedMembers, setDisplayedMembers] = useState<Profile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // Responsive page size
  const pageSize = typeof window !== 'undefined' && window.innerWidth < 768 ? 12 : 24

  // Fetch members from Supabase
  const fetchMembers = useCallback(async () => {
    setIsLoading(true)
    
    await monitor.measure('fetch_community_members', async () => {
      try {
        // Cache key includes test account status to avoid mixing results
        const cacheKey = isCurrentUserTestAccount ? 'community-members-test' : 'community-members'
        
        const members = await requestCache.dedupe(
          cacheKey,
          async () => {
            let query = supabase
              .from('profiles')
              .select('id, avatar_url, full_name, role, nationality, nationality_country_id, nationality2_country_id, base_location, position, secondary_position, current_club, created_at, is_test_account, open_to_play, open_to_coach')
              .eq('onboarding_completed', true) // Only show fully onboarded users
            
            // If current user is NOT a test account, exclude test accounts from results
            if (!isCurrentUserTestAccount) {
              query = query.or('is_test_account.is.null,is_test_account.eq.false')
            }
            
            const { data, error } = await query
              .order('created_at', { ascending: false })
              .limit(200) // Load reasonable batch for client-side filtering

            if (error) throw error
            return (data || []) as Profile[]
          },
          30000 // 30 second cache for community members
        )
        
        setBaseMembers(members)
        setAllMembers(members)
        setDisplayedMembers(members.slice(0, pageSize))
        setHasMore(members.length > pageSize)
      } catch (error) {
        console.error('Error fetching members:', error)
      } finally {
        setIsLoading(false)
      }
    })
  }, [pageSize, isCurrentUserTestAccount])

  // Initial load
  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Perform server-side search
  const performServerSearch = useCallback(async (query: string) => {
    setIsSearching(true)
    
    await monitor.measure('search_community_members', async () => {
      // Cache key includes test account status
      const cacheKey = isCurrentUserTestAccount 
        ? `community-search-test-${query}` 
        : `community-search-${query}`
      
      try {
        const members = await requestCache.dedupe(
          cacheKey,
          async () => {
            const searchTerm = `%${query}%`
            let dbQuery = supabase
              .from('profiles')
              .select('id, avatar_url, full_name, role, nationality, nationality_country_id, nationality2_country_id, base_location, position, secondary_position, current_club, created_at, is_test_account, open_to_play, open_to_coach')
              .eq('onboarding_completed', true) // Only show fully onboarded users
              .or(
                `full_name.ilike.${searchTerm},nationality.ilike.${searchTerm},base_location.ilike.${searchTerm},position.ilike.${searchTerm},secondary_position.ilike.${searchTerm},current_club.ilike.${searchTerm}`
              )
            
            // If current user is NOT a test account, exclude test accounts from results
            if (!isCurrentUserTestAccount) {
              dbQuery = dbQuery.or('is_test_account.is.null,is_test_account.eq.false')
            }
            
            const { data, error } = await dbQuery
              .order('created_at', { ascending: false })
              .limit(200)

            if (error) throw error
            return (data || []) as Profile[]
          },
          20000 // 20 second cache for searches
        )
        
        setAllMembers(members)
        setDisplayedMembers(members.slice(0, pageSize))
        setPage(1)
        setHasMore(members.length > pageSize)
      } catch (error) {
        console.error('Error searching members:', error)
      } finally {
        setIsSearching(false)
      }
    }, { query })
  }, [pageSize, isCurrentUserTestAccount])

  // Server-side search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Reset to initial load
      setIsSearching(false)
      setAllMembers(baseMembers)
      setDisplayedMembers(baseMembers.slice(0, pageSize))
      setPage(1)
      setHasMore(baseMembers.length > pageSize)
      return
    }

    const debounceTimer = setTimeout(() => {
      performServerSearch(searchQuery)
    }, 500)

    return () => clearTimeout(debounceTimer)
  }, [searchQuery, baseMembers, pageSize, performServerSearch])

  // Client-side role and availability filtering
  const filteredMembers = useMemo(() => {
    let result = allMembers
    
    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter(member => member.role === roleFilter)
    }
    
    // Availability filter
    if (availabilityFilter === 'open') {
      result = result.filter(member => 
        (member.role === 'player' && member.open_to_play) ||
        (member.role === 'coach' && member.open_to_coach)
      )
    }
    
    return result
  }, [allMembers, roleFilter, availabilityFilter])

  // Update displayed members when filter changes
  useEffect(() => {
    setDisplayedMembers(filteredMembers.slice(0, pageSize))
    setPage(1)
    setHasMore(filteredMembers.length > pageSize)
  }, [filteredMembers, roleFilter, availabilityFilter, pageSize])

  // Load more handler
  const handleLoadMore = () => {
    const nextPage = page + 1
    const startIndex = page * pageSize
    const endIndex = startIndex + pageSize
    const newMembers = filteredMembers.slice(0, endIndex)
    
    setDisplayedMembers(newMembers)
    setPage(nextPage)
    setHasMore(filteredMembers.length > endIndex)
  }

  // Role filter chips
  const roleFilters: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'player', label: 'Players' },
    { value: 'coach', label: 'Coaches' },
    { value: 'club', label: 'Clubs' },
  ]

  return (
    <div>
      {/* Search Bar */}
      <div className="max-w-2xl mx-auto relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, location, position, or club..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          autoCapitalize="sentences"
          inputMode="search"
        />
        {isSearching && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Role Filter Chips - responsive single row */}
      <div className="flex justify-center mb-6 px-4 sm:px-0">
        <div className="flex gap-1.5 sm:gap-2 w-full max-w-md sm:w-auto">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setRoleFilter(filter.value)}
              className={`flex-1 sm:flex-none px-3 sm:px-6 py-2 sm:py-2.5 min-h-[40px] sm:min-h-[44px] rounded-full text-xs sm:text-sm font-medium transition-all ${
                roleFilter === filter.value
                  ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-300'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Availability Filter - secondary pill toggles */}
      <div className="flex justify-center mb-8 px-4 sm:px-0">
        <div className="flex gap-2 sm:gap-2.5">
          <button
            onClick={() => setAvailabilityFilter('all')}
            className={`px-4 sm:px-5 py-1.5 rounded-full text-xs font-medium transition-all ${
              availabilityFilter === 'all'
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Members
          </button>
          <button
            onClick={() => setAvailabilityFilter('open')}
            className={`px-4 sm:px-5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
              availabilityFilter === 'open'
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            Open to Opportunities
          </button>
        </div>
      </div>

      {/* New Members Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">New Members</h2>
        <p className="text-gray-600 mb-6">See who recently joined PLAYR.</p>

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(12)].map((_, i) => (
              <ProfileCardSkeleton key={i} />
            ))}
          </div>
        ) : displayedMembers.length === 0 ? (
          // Empty State
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">
              {searchQuery.trim() || roleFilter !== 'all' || availabilityFilter !== 'all'
                ? 'No results found. Try a different name or filter.'
                : 'No members yet.'}
            </p>
          </div>
        ) : (
          <>
            {/* Member Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {displayedMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  id={member.id}
                  avatar_url={member.avatar_url}
                  full_name={member.full_name}
                  role={member.role}
                  nationality={member.nationality}
                  nationality_country_id={member.nationality_country_id}
                  nationality2_country_id={member.role === 'club' ? null : member.nationality2_country_id}
                  base_location={member.base_location}
                  position={member.position}
                  secondary_position={member.secondary_position}
                  current_team={member.current_club}
                  created_at={member.created_at}
                  open_to_play={member.open_to_play}
                  open_to_coach={member.open_to_coach}
                />
              ))}
            </div>

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center">
                <button
                  onClick={handleLoadMore}
                  className="px-8 py-3 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-medium hover:opacity-90 transition-opacity"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
