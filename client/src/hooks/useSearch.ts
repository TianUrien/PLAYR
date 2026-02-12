import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export type SearchResultType = 'post' | 'person' | 'club'

export interface SearchPostResult {
  result_type: 'post'
  post_id: string
  content: string
  images: unknown[] | null
  author_id: string
  author_name: string | null
  author_avatar: string | null
  author_role: string
  like_count: number
  comment_count: number
  post_type: string
  created_at: string
}

export interface SearchPersonResult {
  result_type: 'person'
  profile_id: string
  full_name: string | null
  avatar_url: string | null
  role: string
  bio: string | null
  position: string | null
  base_location: string | null
  current_club: string | null
}

export interface SearchClubResult {
  result_type: 'club'
  world_club_id: string
  club_name: string
  country_id: number
  country_code: string
  country_name: string
  flag_emoji: string | null
  avatar_url: string | null
  is_claimed: boolean
  claimed_profile_id: string | null
}

export type SearchResult = SearchPostResult | SearchPersonResult | SearchClubResult

interface SearchResponse {
  results: SearchResult[]
  total: number
  type_counts: {
    posts: number
    people: number
    clubs: number
  }
}

const PAGE_SIZE = 20

export function useSearch(query: string, type?: string | null) {
  return useInfiniteQuery({
    queryKey: ['search', query, type],
    queryFn: async ({ pageParam = 0 }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('search_content', {
        p_query: query,
        p_type: type || null,
        p_limit: PAGE_SIZE,
        p_offset: pageParam,
      })

      if (error) {
        logger.error('[useSearch] RPC error:', error)
        throw error
      }

      return data as SearchResponse
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const totalLoaded = allPages.reduce((sum, page) => sum + page.results.length, 0)
      if (totalLoaded >= lastPage.total) return undefined
      return totalLoaded
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  })
}
