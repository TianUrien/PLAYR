/**
 * WorldCountryPage - Country detail page
 *
 * For countries WITH regions (Argentina, Australia): Shows region cards
 * For countries WITHOUT regions (England, Italy, Germany): Shows league tabs + inline clubs
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Building2, Trophy, CheckCircle, Clock } from 'lucide-react'
import { Header } from '@/components'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

interface Province {
  province_id: number | null
  province_name: string | null
  slug: string | null
  description: string | null
  display_order: number | null
  total_clubs: number | null
  claimed_clubs: number | null
  total_leagues: number | null
}

interface League {
  id: number
  name: string
  slug: string | null
  tier: number | null
  display_order: number | null
  club_count: number
}

interface Club {
  id: string
  club_id: string
  club_name: string
  is_claimed: boolean
  claimed_profile_id: string | null
  profile_username?: string | null
  profile_avatar_url?: string | null
}

interface Country {
  id: number
  code: string
  name: string
  flag_emoji: string | null
  region: string | null
}

export default function WorldCountryPage() {
  const { countrySlug } = useParams<{ countrySlug: string }>()
  const navigate = useNavigate()
  const [country, setCountry] = useState<Country | null>(null)
  const [hasRegions, setHasRegions] = useState<boolean | null>(null)
  const [provinces, setProvinces] = useState<Province[]>([])
  const [leagues, setLeagues] = useState<League[]>([])
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])
  const [clubsLoading, setClubsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women')

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
    if (!countrySlug) return

    const fetchCountryData = async () => {
      try {
        // Get country by code
        const { data: countryData, error: countryError } = await supabase
          .from('countries')
          .select('id, code, name, flag_emoji, region')
          .eq('code', countrySlug.toUpperCase())
          .single()

        if (countryError) throw countryError
        setCountry(countryData)
        document.title = `${countryData.name} | World | PLAYR`

        // Check if country has regions from the view
        const { data: countryInfo, error: infoError } = await supabase
          .from('world_countries_with_directory')
          .select('has_regions')
          .eq('country_id', countryData.id)
          .single()

        if (infoError) {
          // Fallback: check if there are any provinces
          const { count } = await supabase
            .from('world_provinces')
            .select('*', { count: 'exact', head: true })
            .eq('country_id', countryData.id)
          setHasRegions((count ?? 0) > 0)
        } else {
          setHasRegions(countryInfo?.has_regions ?? false)
        }

        if (countryInfo?.has_regions !== false) {
          // Fetch provinces with stats
          const { data: provinceData, error: provinceError } = await supabase
            .from('world_province_stats')
            .select('*')
            .eq('country_id', countryData.id)
            .order('display_order')

          if (provinceError) throw provinceError
          setProvinces(provinceData || [])
        } else {
          // Fetch leagues directly for country-only structure
          await fetchLeaguesForCountry(countryData.id)
        }
      } catch (err) {
        logger.error('[WorldCountryPage] Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchCountryData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countrySlug])

  // Refetch leagues when gender filter changes (only for country-only mode)
  useEffect(() => {
    if (country && hasRegions === false) {
      fetchLeaguesForCountry(country.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter])

  // Fetch clubs when selected league changes
  useEffect(() => {
    if (selectedLeague && country) {
      fetchClubsForLeague(country.id, selectedLeague.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague])

  const fetchLeaguesForCountry = async (countryId: number) => {
    try {
      // Fetch leagues directly for this country (where province_id is null)
      const { data: leagueData, error: leagueError } = await supabase
        .from('world_leagues')
        .select('id, name, slug, tier, display_order')
        .eq('country_id', countryId)
        .is('province_id', null)
        .order('tier')
        .order('display_order')

      if (leagueError) throw leagueError

      // Get club counts per league for the selected gender
      const leagueColumn = genderFilter === 'women' ? 'women_league_id' : 'men_league_id'

      const { data: clubsData } = await supabase
        .from('world_clubs')
        .select(`id, ${leagueColumn}`)
        .eq('country_id', countryId)

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
        id: league.id,
        name: league.name,
        slug: league.slug,
        tier: league.tier,
        display_order: league.display_order,
        club_count: leagueClubCounts.get(league.id) || 0
      }))

      setLeagues(leaguesWithCounts)

      // Auto-select first league with clubs, or first league
      const firstWithClubs = leaguesWithCounts.find(l => l.club_count > 0)
      const autoSelect = firstWithClubs || leaguesWithCounts[0] || null
      setSelectedLeague(autoSelect)
      if (!autoSelect) {
        setClubs([])
      }
    } catch (err) {
      logger.error('[WorldCountryPage] Failed to fetch leagues:', err)
    }
  }

  const fetchClubsForLeague = async (countryId: number, leagueId: number) => {
    try {
      setClubsLoading(true)
      const leagueColumn = genderFilter === 'women' ? 'women_league_id' : 'men_league_id'

      const { data: clubData, error: clubError } = await supabase
        .from('world_clubs')
        .select('id, club_id, club_name, is_claimed, claimed_profile_id')
        .eq('country_id', countryId)
        .eq(leagueColumn, leagueId)
        .order('is_claimed', { ascending: false })
        .order('club_name')

      if (clubError) throw clubError

      // Get usernames and avatars for claimed clubs
      const claimedIds = (clubData || [])
        .filter(c => c.claimed_profile_id)
        .map(c => c.claimed_profile_id)
        .filter((id): id is string => id !== null)

      const profileMap = new Map<string, { username: string | null; avatar_url: string | null }>()
      if (claimedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', claimedIds)

        for (const p of profiles || []) {
          profileMap.set(p.id, { username: p.username, avatar_url: p.avatar_url })
        }
      }

      const transformedClubs = (clubData || []).map(club => {
        const profile = club.claimed_profile_id ? profileMap.get(club.claimed_profile_id) : null
        // Treat as unclaimed if claimed_profile_id is missing (orphaned claim)
        const effectivelyClaimed = club.is_claimed && !!club.claimed_profile_id
        return {
          id: club.id,
          club_id: club.club_id,
          club_name: club.club_name,
          is_claimed: effectivelyClaimed,
          claimed_profile_id: club.claimed_profile_id,
          profile_username: profile?.username ?? null,
          profile_avatar_url: profile?.avatar_url ?? null,
        }
      })

      setClubs(transformedClubs)
    } catch (err) {
      logger.error('[WorldCountryPage] Failed to fetch clubs:', err)
    } finally {
      setClubsLoading(false)
    }
  }

  const handleClubClick = (club: Club) => {
    if (club.is_claimed && club.profile_username) {
      navigate(`/clubs/${club.profile_username}`)
    } else if (club.is_claimed && club.claimed_profile_id) {
      navigate(`/clubs/id/${club.claimed_profile_id}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-48 mb-8" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 p-6">
                  <div className="h-12 w-12 bg-gray-200 rounded-full mx-auto mb-4" />
                  <div className="h-5 bg-gray-200 rounded w-24 mx-auto mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-32 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!country) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="text-center py-12">
            <p className="text-gray-500">Country not found</p>
            <Link to="/world" className="text-blue-600 hover:underline mt-2 inline-block">
              Back to World
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/world')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Country Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-md border border-gray-200">
              <img
                src={flagUrl}
                alt={`${country.name} flag`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const span = document.createElement('span');
                  span.className = 'text-4xl';
                  span.textContent = country.flag_emoji || '';
                  const parent = target.parentElement!;
                  parent.replaceChildren(span);
                  parent.className = 'w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <Link to="/world" className="hover:text-gray-700">World</Link>
                <span>/</span>
                <span className="text-[#8026FA]">{country.name}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{country.name}</h1>
            </div>
          </div>
        </div>

        {/* Gradient Bar */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500 rounded-full mb-8" />

        {hasRegions ? (
          /* ===== REGION-BASED COUNTRIES ===== */
          <>
            <div className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Regions</h2>
              <p className="text-gray-600 mb-6">
                Select a region to explore leagues and clubs in {country.name}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {provinces.map((province) => (
                  <div
                    key={province.province_id}
                    onClick={() => navigate(`/world/${countrySlug}/${province.slug}`)}
                    className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer text-center"
                  >
                    <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-7 h-7 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-gray-900 text-lg mb-1">{province.province_name}</h3>
                    <p className="text-sm text-gray-500 mb-4">{province.description}</p>

                    <div className="flex flex-wrap justify-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        <Trophy className="w-3 h-3" />
                        {province.total_leagues} {province.total_leagues === 1 ? 'league' : 'leagues'}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        <Building2 className="w-3 h-3" />
                        {province.total_clubs} {province.total_clubs === 1 ? 'club' : 'clubs'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{country.name}'s Hockey Structure</h3>
                  <p className="text-sm text-gray-600">
                    {country.name} organizes its hockey system by region. Each region manages its own leagues and tournaments.
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ===== REGION-LESS COUNTRIES: League Tabs + Inline Clubs ===== */
          <>
            {/* Gender + League Tabs Row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
              {/* Gender Toggle */}
              <div className="inline-flex bg-gray-100 rounded-full p-1 flex-shrink-0">
                <button
                  onClick={() => setGenderFilter('women')}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    genderFilter === 'women'
                      ? 'bg-[#8026FA] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Women
                </button>
                <button
                  onClick={() => setGenderFilter('men')}
                  className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                    genderFilter === 'men'
                      ? 'bg-[#8026FA] text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Men
                </button>
              </div>

              {/* League Tabs */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {leagues.map((league) => (
                  <button
                    key={league.id}
                    onClick={() => setSelectedLeague(league)}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border ${
                      selectedLeague?.id === league.id
                        ? 'bg-white border-[#8026FA] text-[#8026FA] shadow-sm'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {league.name}
                    <span className="ml-1.5 text-xs opacity-70">{league.club_count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Clubs List */}
            {clubsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200" />
                      <div className="h-5 bg-gray-200 rounded w-40" />
                    </div>
                  </div>
                ))}
              </div>
            ) : clubs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No clubs in this league yet</p>
                <p className="text-sm text-gray-400 mt-1">
                  Clubs will appear here once they join the platform
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {clubs.map((club) => (
                  <button
                    key={club.id}
                    onClick={() => handleClubClick(club)}
                    disabled={!club.is_claimed}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      club.is_claimed
                        ? 'bg-white border-gray-200 hover:border-[#8026FA] hover:shadow-md cursor-pointer'
                        : 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {club.is_claimed && club.profile_avatar_url ? (
                          <img
                            src={club.profile_avatar_url}
                            alt={club.club_name}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            club.is_claimed
                              ? 'bg-gradient-to-br from-[#8026FA] to-[#924CEC]'
                              : 'bg-gray-200'
                          }`}>
                            <Building2 className={`w-5 h-5 ${club.is_claimed ? 'text-white' : 'text-gray-400'}`} />
                          </div>
                        )}
                        <div>
                          <h3 className={`font-medium ${club.is_claimed ? 'text-gray-900' : 'text-gray-500'}`}>
                            {club.club_name}
                          </h3>
                          {club.profile_username && (
                            <p className="text-sm text-gray-500">@{club.profile_username}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {club.is_claimed ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            <Clock className="w-3 h-3" />
                            Unclaimed
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
