import { useMutation } from '@tanstack/react-query'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export interface DiscoverResult {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
  role: string
  position: string | null
  secondary_position: string | null
  gender: string | null
  age: number | null
  nationality_name: string | null
  nationality2_name: string | null
  flag_emoji: string | null
  flag_emoji2: string | null
  base_location: string | null
  base_country_name: string | null
  current_club: string | null
  current_world_club_id: string | null
  open_to_play: boolean
  open_to_coach: boolean
  open_to_opportunities: boolean
  accepted_reference_count: number
  career_entry_count: number
  accepted_friend_count: number
  last_active_at: string | null
}

export interface ParsedFilters {
  roles?: string[]
  positions?: string[]
  gender?: string
  min_age?: number
  max_age?: number
  eu_passport?: boolean
  nationalities?: string[]
  locations?: string[]
  availability?: string
  min_references?: number
  min_career_entries?: number
  leagues?: string[]
  countries?: string[]
  text_query?: string
  sort_by?: string
  summary?: string
}

export interface DiscoverResponse {
  success: boolean
  data: DiscoverResult[]
  total: number
  has_more: boolean
  parsed_filters: ParsedFilters
  summary: string
  error?: string
}

export function useDiscover() {
  return useMutation({
    mutationFn: async (query: string): Promise<DiscoverResponse> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch(`${SUPABASE_URL}/functions/v1/nl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ query }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Search failed')
      }

      return result as DiscoverResponse
    },
    onError: (error) => {
      logger.error('[useDiscover] Error:', error)
    },
  })
}
