import { useState, useEffect, useRef } from 'react'
import { Search, Sparkles, AlertCircle, Loader2, Bot } from 'lucide-react'
import { useDiscover, type DiscoverResult } from '@/hooks/useDiscover'
import DiscoverFilterChips from '@/components/DiscoverFilterChips'
import MemberCard from '@/components/MemberCard'
import { Header } from '@/components'

const EXAMPLE_QUERIES = [
  'Find U25 defenders with a EU passport and 2+ references',
  'Show female defenders open to play',
  'Find men goalkeepers from New Zealand',
]

/** Skeleton loader for result cards */
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 bg-gray-200 rounded-full" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-3/4" />
      </div>
    </div>
  )
}

export default function DiscoverPage() {
  const [query, setQuery] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { mutate: search, data: response, isPending, error } = useDiscover()

  // Rotate placeholder examples
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % EXAMPLE_QUERIES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) return
    search(trimmed)
  }

  const handleExampleClick = (example: string) => {
    setQuery(example)
    search(example)
  }

  const results = response?.data ?? []
  const hasSearched = !!response || !!error
  const isConversationOnly = !!response && response.parsed_filters === null

  return (
    <div className="min-h-screen bg-gray-50 pt-[var(--app-header-offset)]">
      <Header />
      {/* Search section */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 pt-6 pb-5">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-[#8026FA]" />
            <h1 className="text-xl font-bold text-gray-900">Discover</h1>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Ask me anything — search for players, coaches, clubs, and brands using natural language.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 w-5 h-5 text-gray-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={EXAMPLE_QUERIES[placeholderIndex]}
                className="w-full pl-11 pr-24 py-3.5 bg-gray-50 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8026FA] focus:border-transparent transition-all"
                disabled={isPending}
              />
              <button
                type="submit"
                disabled={isPending || query.trim().length < 2}
                className="absolute right-2 px-4 py-2 bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md transition-all"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Ask'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Content area */}
      <div className="max-w-4xl mx-auto px-4 py-5">
        {/* AI message bubble */}
        {response?.ai_message && (
          <div className="mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8026FA] to-[#924CEC] flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                <p className="text-sm text-gray-800 leading-relaxed">
                  {response.ai_message}
                </p>
              </div>
            </div>
            {response.parsed_filters && (
              <div className="pl-11">
                <DiscoverFilterChips filters={response.parsed_filters} />
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl mb-4">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Search failed</p>
              <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Something went wrong. Please try again.'}</p>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {isPending && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Results grid */}
        {!isPending && results.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result: DiscoverResult) => (
              <MemberCard
                key={result.id}
                id={result.id}
                avatar_url={result.avatar_url}
                full_name={result.full_name ?? 'Unknown'}
                role={result.role as 'player' | 'coach' | 'club' | 'brand'}
                nationality={result.nationality_name}
                nationality_country_id={result.nationality_country_id}
                nationality2_country_id={result.nationality2_country_id}
                base_location={result.base_location}
                position={result.position}
                secondary_position={result.secondary_position}
                current_team={result.current_club}
                current_world_club_id={result.current_world_club_id ?? undefined}
                created_at=""
                open_to_play={result.open_to_play}
                open_to_coach={result.open_to_coach}
              />
            ))}
          </div>
        )}

        {/* Empty results (after search, not conversation-only) */}
        {!isPending && hasSearched && results.length === 0 && !error && !isConversationOnly && (
          <div className="text-center py-8">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Try adjusting your filters or ask me in a different way.</p>
          </div>
        )}

        {/* Example queries — shown before first search OR after conversation-only response */}
        {!isPending && (!hasSearched || isConversationOnly) && (
          <div className="pt-2">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Try one of these searches</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  onClick={() => handleExampleClick(example)}
                  className="text-left p-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-[#8026FA] hover:bg-[#8026FA]/5 transition-colors"
                >
                  <span className="text-gray-400 mr-1.5">&ldquo;</span>
                  {example}
                  <span className="text-gray-400 ml-1.5">&rdquo;</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
