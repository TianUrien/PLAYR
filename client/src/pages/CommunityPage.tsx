import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { Header, MemberCard } from '@/components'
import { ProfileCardSkeleton } from '@/components/Skeleton'
import { supabase } from '@/lib/supabase'
import { requestCache } from '@/lib/requestCache'
import { monitor } from '@/lib/monitor'

interface Profile {
  id: string
  avatar_url: string | null
  full_name: string
  role: 'player' | 'coach' | 'club'
  nationality: string | null
  base_location: string | null
  position: string | null
  secondary_position: string | null
  current_club: string | null
  created_at: string
}

type RoleFilter = 'all' | 'player' | 'coach' | 'club'

export default function CommunityPage() {
  const [baseMembers, setBaseMembers] = useState<Profile[]>([])
  const [allMembers, setAllMembers] = useState<Profile[]>([])
  const [displayedMembers, setDisplayedMembers] = useState<Profile[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
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
        const members = await requestCache.dedupe(
          'community-members',
          async () => {
            const { data, error } = await supabase
              .from('profiles')
              .select('id, avatar_url, full_name, role, nationality, base_location, position, secondary_position, current_club, created_at')
              .eq('onboarding_completed', true) // Only show fully onboarded users
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
  }, [pageSize])

  // Initial load
  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // Perform server-side search
  const performServerSearch = useCallback(async (query: string) => {
    setIsSearching(true)
    
    await monitor.measure('search_community_members', async () => {
      const cacheKey = `community-search-${query}`
      
      try {
        const members = await requestCache.dedupe(
          cacheKey,
          async () => {
            const searchTerm = `%${query}%`
            const { data, error } = await supabase
              .from('profiles')
              .select('id, avatar_url, full_name, role, nationality, base_location, position, secondary_position, current_club, created_at')
              .eq('onboarding_completed', true) // Only show fully onboarded users
              .or(
                `full_name.ilike.${searchTerm},nationality.ilike.${searchTerm},base_location.ilike.${searchTerm},position.ilike.${searchTerm},secondary_position.ilike.${searchTerm},current_club.ilike.${searchTerm}`
              )
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
  }, [pageSize])

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
  }, [searchQuery, allMembers, baseMembers, pageSize, performServerSearch])

  // Client-side role filtering
  const filteredMembers = useMemo(() => {
    if (roleFilter === 'all') return allMembers
    return allMembers.filter(member => member.role === roleFilter)
  }, [allMembers, roleFilter])

  // Update displayed members when filter changes
  useEffect(() => {
    setDisplayedMembers(filteredMembers.slice(0, pageSize))
    setPage(1)
    setHasMore(filteredMembers.length > pageSize)
  }, [filteredMembers, roleFilter, pageSize])

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
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-24 pb-12">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-transparent bg-clip-text">
              Community
            </span>
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Connect with players, coaches, and clubs around the world.
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
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
        </div>

        {/* Role Filter Chips */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {roleFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setRoleFilter(filter.value)}
              className={`px-6 py-2.5 min-h-[44px] rounded-full text-sm font-medium transition-all ${
                roleFilter === filter.value
                  ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-purple-300'
              }`}
            >
              {filter.label}
            </button>
          ))}
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
                {searchQuery.trim() || roleFilter !== 'all'
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
                    base_location={member.base_location}
                    position={member.position}
                    secondary_position={member.secondary_position}
                    current_team={member.current_club}
                    created_at={member.created_at}
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
      </main>
    </div>
  )
}
