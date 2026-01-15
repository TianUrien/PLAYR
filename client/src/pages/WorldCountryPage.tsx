/**
 * WorldCountryPage - Country detail page showing regions OR leagues
 * 
 * For countries WITH regions (Argentina, Australia): Shows region cards
 * For countries WITHOUT regions (England, Italy, Germany): Shows league cards directly
 * 
 * Navigation:
 * - With regions: /world/ar → region selection → /world/ar/buenos-aires
 * - Without regions: /world/xe → league selection → /world/xe/premier-division
 */

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Building2, Trophy, ChevronRight, Globe } from 'lucide-react'
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
      
      const { data: clubs } = await supabase
        .from('world_clubs')
        .select(`id, ${leagueColumn}`)
        .eq('country_id', countryId)

      // Count clubs per league
      const leagueClubCounts = new Map<number, number>()
      for (const club of clubs || []) {
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
    } catch (err) {
      logger.error('[WorldCountryPage] Failed to fetch leagues:', err)
    }
  }

  const getTierLabel = (tier: number | null) => {
    switch (tier) {
      case 1: return 'Premier'
      case 2: return 'Second Tier'
      case 3: return 'Third Tier'
      default: return ''
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
              ← Back to World
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const itemCount = hasRegions ? provinces.length : leagues.length
  const itemLabel = hasRegions ? 'regions' : 'leagues'

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
                  target.parentElement!.innerHTML = `<span class="text-4xl">${country.flag_emoji || '🏳️'}</span>`;
                  target.parentElement!.className = 'w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <span>World</span>
                <span>/</span>
                <span className="text-blue-600">{country.name}</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {country.name} - {hasRegions ? 'Select Region' : 'Select League'}
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg">
            {hasRegions ? (
              <>
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{itemCount} {itemLabel}</span>
              </>
            ) : (
              <>
                <Trophy className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600">{itemCount} {itemLabel}</span>
              </>
            )}
          </div>
        </div>

        {/* Gradient Bar */}
        <div className="h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500 rounded-full mb-8" />

        {/* Gender Toggle */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-white border border-gray-200 rounded-full p-1">
            <button
              onClick={() => setGenderFilter('women')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                genderFilter === 'women'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Women
            </button>
            <button
              onClick={() => setGenderFilter('men')}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                genderFilter === 'men'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Men
            </button>
          </div>
        </div>

        {/* Content Section - Either Regions or Leagues */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            {hasRegions ? 'Regions' : 'Leagues'}
          </h2>
          <p className="text-gray-600 mb-6">
            {hasRegions
              ? `Select a region to explore leagues and clubs in ${country.name}'s ${genderFilter}'s hockey`
              : `Select a league to explore clubs in ${country.name}'s ${genderFilter}'s hockey`
            }
          </p>

          {hasRegions ? (
            // Regions Grid
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
          ) : (
            // Leagues Grid (for countries without regions)
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leagues.map((league) => (
                <div
                  key={league.id}
                  onClick={() => navigate(`/world/${countrySlug}/${league.slug}`)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-200 transition-all cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{league.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        {league.tier && (
                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                            {getTierLabel(league.tier)}
                          </span>
                        )}
                        <span>{league.club_count} {league.club_count === 1 ? 'club' : 'clubs'}</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              {hasRegions ? (
                <MapPin className="w-5 h-5 text-blue-600" />
              ) : (
                <Globe className="w-5 h-5 text-blue-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">{country.name}'s Hockey Structure</h3>
              <p className="text-sm text-gray-600">
                {hasRegions
                  ? `${country.name} organizes its hockey system by region. Each region manages its own leagues and tournaments, creating a unique regional structure that reflects the country's diverse hockey culture.`
                  : `${country.name}'s hockey is organized at the national level with a tiered league system. Explore the different divisions to find clubs and players.`
                }
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
