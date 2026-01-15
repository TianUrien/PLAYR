/**
 * WorldProvincePage - Smart page that handles both:
 * 
 * 1. Province context (countries WITH regions like Argentina):
 *    /world/ar/buenos-aires → Shows leagues for Buenos Aires province
 * 
 * 2. Direct league context (countries WITHOUT regions like England):
 *    /world/xe/premier-division → Shows clubs for Premier Division league
 * 
 * The page detects which mode to use based on the URL slug:
 * - If slug matches a province → show leagues for that province
 * - If slug matches a league for a region-less country → show clubs for that league
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2, Trophy, ChevronRight, Users, ExternalLink } from 'lucide-react'
import { Header } from '@/components'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// Types for Province mode (showing leagues)
interface League {
  id: number
  name: string
  slug: string | null
  tier: number | null
  display_order: number | null
  club_count: number
}

interface Province {
  id: number
  name: string
  slug: string
  description: string | null
}

// Types for League mode (showing clubs)
interface Club {
  id: string
  club_id: string
  club_name: string
  is_claimed: boolean
  claimed_profile_id: string | null
}

interface LeagueInfo {
  id: number
  name: string
  slug: string | null
  tier: number | null
}

interface Country {
  id: number
  code: string
  name: string
  flag_emoji: string | null
}

type PageMode = 'loading' | 'province' | 'league' | 'not-found'

export default function WorldProvincePage() {
  const { countrySlug, provinceSlug } = useParams<{ countrySlug: string; provinceSlug: string }>()
  const navigate = useNavigate()
  
  // Common state
  const [country, setCountry] = useState<Country | null>(null)
  const [loading, setLoading] = useState(true)
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women')
  const [pageMode, setPageMode] = useState<PageMode>('loading')
  
  // Province mode state (showing leagues)
  const [province, setProvince] = useState<Province | null>(null)
  const [leagues, setLeagues] = useState<League[]>([])
  const [totalClubs, setTotalClubs] = useState(0)
  
  // League mode state (showing clubs)
  const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])

  // Compute the correct flag URL based on country code
  const flagUrl = useMemo(() => {
    if (!country) return ''
    // England uses XE code but needs gb-eng for flagcdn
    if (country.code === 'XE') {
      return 'https://flagcdn.com/w160/gb-eng.png'
    }
    return `https://flagcdn.com/w160/${country.code.toLowerCase()}.png`
  }, [country])

  useEffect(() => {
    if (!countrySlug || !provinceSlug) return

    const fetchData = async () => {
      try {
        // Get country
        const { data: countryData, error: countryError } = await supabase
          .from('countries')
          .select('id, code, name, flag_emoji')
          .eq('code', countrySlug.toUpperCase())
          .single()

        if (countryError) throw countryError
        setCountry(countryData)

        // Try to find a province with this slug
        const { data: provinceData, error: provinceError } = await supabase
          .from('world_provinces')
          .select('id, name, slug, description')
          .eq('country_id', countryData.id)
          .eq('slug', provinceSlug)
          .single()

        if (!provinceError && provinceData) {
          // Found a province - we're in Province mode (show leagues)
          setProvince(provinceData)
          setPageMode('province')
          document.title = `${provinceData.name} - Leagues | ${countryData.name} | PLAYR`
          
          // Get leagues for this province
          await fetchLeaguesForProvince(provinceData.id)
          
          // Get total clubs count for this province
          const { count: clubCount } = await supabase
            .from('world_clubs')
            .select('*', { count: 'exact', head: true })
            .eq('province_id', provinceData.id)
          setTotalClubs(clubCount || 0)
        } else {
          // No province found - check if it's a league for a region-less country
          const { data: leagueData, error: leagueError } = await supabase
            .from('world_leagues')
            .select('id, name, slug, tier')
            .eq('country_id', countryData.id)
            .is('province_id', null)
            .eq('slug', provinceSlug)
            .single()

          if (!leagueError && leagueData) {
            // Found a league - we're in League mode (show clubs)
            setLeagueInfo(leagueData)
            setPageMode('league')
            document.title = `${leagueData.name} - Clubs | ${countryData.name} | PLAYR`
            
            // Fetch clubs for this league
            await fetchClubsForLeague(countryData.id, leagueData.id)
          } else {
            // Neither province nor league found
            setPageMode('not-found')
          }
        }
      } catch (err) {
        logger.error('[WorldProvincePage] Failed to fetch data:', err)
        setPageMode('not-found')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countrySlug, provinceSlug])

  // Refetch when gender filter changes
  useEffect(() => {
    if (!country) return
    
    if (pageMode === 'province' && province) {
      fetchLeaguesForProvince(province.id)
    } else if (pageMode === 'league' && leagueInfo) {
      fetchClubsForLeague(country.id, leagueInfo.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter])

  const fetchLeaguesForProvince = async (provinceId: number) => {
    try {
      // Get leagues for this province
      const { data: leagueData, error: leagueError } = await supabase
        .from('world_leagues')
        .select('id, name, slug, tier, display_order')
        .eq('province_id', provinceId)
        .order('display_order')

      if (leagueError) throw leagueError

      // Get club counts per league for the selected gender
      const leagueColumn = genderFilter === 'women' ? 'women_league_id' : 'men_league_id'
      
      const { data: clubsData } = await supabase
        .from('world_clubs')
        .select(`id, ${leagueColumn}`)
        .eq('province_id', provinceId)

      // Count clubs per league
      const leagueClubCounts = new Map<number, number>()
      for (const club of clubsData || []) {
        const leagueId = (club as Record<string, unknown>)[leagueColumn] as number | null
        if (leagueId) {
          leagueClubCounts.set(leagueId, (leagueClubCounts.get(leagueId) || 0) + 1)
        }
      }

      // Merge counts into league data
      const leaguesWithCounts = (leagueData || []).map(league => ({
        ...league,
        club_count: leagueClubCounts.get(league.id) || 0
      }))

      setLeagues(leaguesWithCounts)
    } catch (err) {
      logger.error('[WorldProvincePage] Failed to fetch leagues:', err)
    }
  }

  const fetchClubsForLeague = async (countryId: number, leagueId: number) => {
    try {
      const leagueColumn = genderFilter === 'women' ? 'women_league_id' : 'men_league_id'
      
      const { data: clubsData, error: clubsError } = await supabase
        .from('world_clubs')
        .select('id, club_id, club_name, is_claimed, claimed_profile_id')
        .eq('country_id', countryId)
        .eq(leagueColumn, leagueId)
        .order('club_name')

      if (clubsError) throw clubsError
      setClubs(clubsData || [])
    } catch (err) {
      logger.error('[WorldProvincePage] Failed to fetch clubs:', err)
    }
  }

  const getTierLabel = (tier: number | null) => {
    switch (tier) {
      case 1: return 'Provincial Premier'
      case 2: return 'Provincial Second'
      case 3: return 'Provincial Third'
      default: return 'League'
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="h-6 bg-gray-200 rounded w-48 mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-32" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Not found state
  if (pageMode === 'not-found' || !country) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6 text-center">
          <p className="text-gray-600">Region or league not found</p>
          <button 
            onClick={() => navigate('/world')}
            className="mt-4 text-[#6366f1] hover:underline"
          >
            Back to World
          </button>
        </main>
      </div>
    )
  }

  // Province mode - showing leagues
  if (pageMode === 'province' && province) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          {/* Back Button */}
          <button
            onClick={() => navigate(`/world/${countrySlug}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-2 border-sky-200 overflow-hidden">
                <img
                  src={flagUrl}
                  alt={`${country.name} flag`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = `<span class="text-3xl">${country.flag_emoji || '🏳️'}</span>`;
                    target.parentElement!.className = 'w-16 h-16 rounded-full bg-gradient-to-br from-sky-100 to-white border-2 border-sky-200 flex items-center justify-center';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <span>World</span>
                  <span>/</span>
                  <Link to={`/world/${countrySlug}`} className="text-[#6366f1] hover:underline">
                    {country.name}
                  </Link>
                  <span>/</span>
                  <span className="text-[#6366f1]">{province.name}</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{province.name} - Leagues</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 bg-[#6366f1]/10 rounded-full text-sm text-[#6366f1] font-medium">
                <Trophy className="w-4 h-4 inline mr-1" />
                {leagues.length} leagues
              </div>
              <div className="px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 font-medium">
                <Building2 className="w-4 h-4 inline mr-1" />
                {totalClubs} clubs
              </div>
            </div>
          </div>

          {/* Gender Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setGenderFilter('women')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  genderFilter === 'women'
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Women
              </button>
              <button
                onClick={() => setGenderFilter('men')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  genderFilter === 'men'
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Men
              </button>
            </div>
          </div>

          {/* Leagues Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Leagues</h2>
            <p className="text-gray-600 mb-6">
              Select a league to explore clubs in {country.name}'s {genderFilter === 'women' ? "women's" : "men's"} hockey
            </p>

            {leagues.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No leagues found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {leagues.map((league) => (
                  <button
                    key={league.id}
                    onClick={() => navigate(`/world/${countrySlug}/${provinceSlug}/${league.slug}`)}
                    className="group text-left p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-[#6366f1] active:border-[#4f46e5] active:bg-gray-50 transition-colors duration-150 will-change-[border-color]"
                  >
                    <div className="flex items-center justify-between pointer-events-none">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-[#6366f1]/10 flex items-center justify-center">
                          <Trophy className="w-6 h-6 text-[#6366f1]" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 group-hover:text-[#6366f1] transition-colors duration-150">
                            {league.name}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Trophy className="w-3 h-3" />
                              {getTierLabel(league.tier)}
                            </span>
                            <span>•</span>
                            <span>{province.name}</span>
                          </div>
                          <span className="inline-block mt-2 px-2 py-0.5 bg-[#6366f1]/10 text-[#6366f1] text-xs font-medium rounded-full">
                            {league.club_count} clubs
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#6366f1] transition-colors duration-150" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  // League mode - showing clubs (for countries without regions)
  if (pageMode === 'league' && leagueInfo) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          {/* Back Button */}
          <button
            onClick={() => navigate(`/world/${countrySlug}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border-2 border-sky-200 overflow-hidden">
                <img
                  src={flagUrl}
                  alt={`${country.name} flag`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML = `<span class="text-3xl">${country.flag_emoji || '🏳️'}</span>`;
                    target.parentElement!.className = 'w-16 h-16 rounded-full bg-gradient-to-br from-sky-100 to-white border-2 border-sky-200 flex items-center justify-center';
                  }}
                />
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                  <span>World</span>
                  <span>/</span>
                  <Link to={`/world/${countrySlug}`} className="text-[#6366f1] hover:underline">
                    {country.name}
                  </Link>
                  <span>/</span>
                  <span className="text-[#6366f1]">{leagueInfo.name}</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{leagueInfo.name}</h1>
                {leagueInfo.tier && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded">
                    {getTierLabel(leagueInfo.tier)}
                  </span>
                )}
              </div>
            </div>

            <div className="px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-600 font-medium">
              <Building2 className="w-4 h-4 inline mr-1" />
              {clubs.length} clubs
            </div>
          </div>

          {/* Gender Toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setGenderFilter('women')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  genderFilter === 'women'
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Women
              </button>
              <button
                onClick={() => setGenderFilter('men')}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  genderFilter === 'men'
                    ? 'bg-[#6366f1] text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Men
              </button>
            </div>
          </div>

          {/* Clubs Section */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Clubs</h2>
            <p className="text-gray-600 mb-6">
              Explore clubs competing in {leagueInfo.name}
            </p>

            {clubs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No clubs found in this league</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clubs.map((club) => (
                  <div
                    key={club.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                        {club.club_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{club.club_name}</h3>
                        <div className="mt-2 flex items-center gap-2">
                          {club.is_claimed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                              <Users className="w-3 h-3" />
                              Claimed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                              Available
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {club.is_claimed && club.claimed_profile_id && (
                      <button
                        onClick={() => navigate(`/club/${club.claimed_profile_id}`)}
                        className="mt-4 w-full py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors flex items-center justify-center gap-1"
                      >
                        View Club Profile
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    )
  }

  return null
}
