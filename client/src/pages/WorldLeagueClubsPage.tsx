/**
 * WorldLeagueClubsPage - Shows clubs for a specific league
 * 
 * Navigation: /world/ar/buenos-aires/torneo-metropolitano-a
 * Shows all clubs that participate in this league (men or women)
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Building2, Trophy, CheckCircle, Clock } from 'lucide-react'
import { Header } from '@/components'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

interface Club {
  id: string
  club_id: string
  club_name: string
  is_claimed: boolean
  claimed_profile_id: string | null
  profile_username?: string | null
  profile_avatar_url?: string | null
}

interface Province {
  id: number
  name: string
  slug: string
}

interface Country {
  id: number
  code: string
  name: string
  flag_emoji: string | null
}

interface League {
  id: number
  name: string
  slug: string | null
  tier: number | null
}

export default function WorldLeagueClubsPage() {
  const { countrySlug, provinceSlug, leagueSlug } = useParams<{ 
    countrySlug: string
    provinceSlug: string
    leagueSlug: string 
  }>()
  const navigate = useNavigate()
  const [country, setCountry] = useState<Country | null>(null)
  const [province, setProvince] = useState<Province | null>(null)
  const [league, setLeague] = useState<League | null>(null)
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [genderFilter, setGenderFilter] = useState<'women' | 'men'>('women')

  useEffect(() => {
    if (!countrySlug || !provinceSlug || !leagueSlug) return

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

        // Get province
        const { data: provinceData, error: provinceError } = await supabase
          .from('world_provinces')
          .select('id, name, slug')
          .eq('country_id', countryData.id)
          .eq('slug', provinceSlug)
          .single()

        if (provinceError) throw provinceError
        setProvince(provinceData)

        // Get league
        const { data: leagueData, error: leagueError } = await supabase
          .from('world_leagues')
          .select('id, name, slug, tier')
          .eq('province_id', provinceData.id)
          .eq('slug', leagueSlug)
          .single()

        if (leagueError) throw leagueError
        setLeague(leagueData)
        document.title = `${leagueData.name} | ${provinceData.name} | PLAYR`

        // Fetch clubs for this league
        await fetchClubs(leagueData.id, provinceData.id)
      } catch (err) {
        logger.error('[WorldLeagueClubsPage] Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countrySlug, provinceSlug, leagueSlug])

  // Refetch clubs when gender filter changes
  useEffect(() => {
    if (league && province) {
      fetchClubs(league.id, province.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genderFilter, league, province])

  const fetchClubs = async (leagueId: number, provinceId: number) => {
    try {
      // Get clubs that have this league assigned for the selected gender
      const leagueColumn = genderFilter === 'women' ? 'women_league_id' : 'men_league_id'
      
      const { data: clubData, error: clubError } = await supabase
        .from('world_clubs')
        .select('id, club_id, club_name, is_claimed, claimed_profile_id')
        .eq('province_id', provinceId)
        .eq(leagueColumn, leagueId)
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

      // Transform club data
      const transformedClubs = (clubData || []).map(club => {
        const profile = club.claimed_profile_id ? profileMap.get(club.claimed_profile_id) : null
        return {
          id: club.id,
          club_id: club.club_id,
          club_name: club.club_name,
          is_claimed: club.is_claimed,
          claimed_profile_id: club.claimed_profile_id,
          profile_username: profile?.username ?? null,
          profile_avatar_url: profile?.avatar_url ?? null,
        }
      })

      setClubs(transformedClubs)
    } catch (err) {
      logger.error('[WorldLeagueClubsPage] Failed to fetch clubs:', err)
    }
  }

  const handleClubClick = (club: Club) => {
    if (club.is_claimed && club.profile_username) {
      navigate(`/clubs/${club.profile_username}`)
    } else if (club.is_claimed && club.claimed_profile_id) {
      navigate(`/clubs/id/${club.claimed_profile_id}`)
    }
    // Unclaimed clubs are not clickable
  }

  const getTierLabel = (tier: number | null) => {
    switch (tier) {
      case 1: return 'Provincial Premier'
      case 2: return 'Provincial Second'
      case 3: return 'Provincial Third'
      default: return 'League'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-64 mb-8" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="h-6 bg-gray-200 rounded w-48" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!country || !province || !league) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6 text-center">
          <p className="text-gray-600">League not found</p>
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-7xl px-4 pt-24 pb-12 md:px-6">
        {/* Back Button */}
        <button
          onClick={() => navigate(`/world/${countrySlug}/${provinceSlug}`)}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                <span>World</span>
                <span>/</span>
                <Link to={`/world/${countrySlug}`} className="text-[#6366f1] hover:underline">
                  {country.name}
                </Link>
                <span>/</span>
                <Link to={`/world/${countrySlug}/${provinceSlug}`} className="text-[#6366f1] hover:underline">
                  {province.name}
                </Link>
              </div>
              <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
              <p className="text-gray-600">{getTierLabel(league.tier)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-[#6366f1]/10 rounded-full text-sm text-[#6366f1] font-medium">
              <Building2 className="w-4 h-4 inline mr-1" />
              {clubs.length} clubs
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

        {/* Clubs List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Clubs in {league.name}
          </h2>
          <p className="text-gray-600 mb-6">
            {genderFilter === 'women' ? "Women's" : "Men's"} teams competing in this league
          </p>

          {clubs.length === 0 ? (
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
                      ? 'bg-white border-gray-200 hover:border-[#6366f1] hover:shadow-md cursor-pointer'
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
                            ? 'bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]' 
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
        </div>
      </main>
    </div>
  )
}
