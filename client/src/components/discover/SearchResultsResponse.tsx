import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DiscoverResult, ParsedFilters } from '@/hooks/useDiscover'
import DiscoverResultCard from '@/components/DiscoverResultCard'
import DiscoverFilterChips from '@/components/DiscoverFilterChips'

interface SearchResultsResponseProps {
  message: string
  results: DiscoverResult[]
  parsedFilters?: ParsedFilters | null
}

/**
 * Renders a successful search: short message + result list + read-only filter
 * chips under the bubble. Extracted from the prior inline render in
 * DiscoverChat.tsx so the dispatcher can compose it cleanly.
 *
 * No suggested-action chips on results in PR-2 — refine chips ("Show only
 * U21", "Filter to Spain") ship with Package B. The existing collapsible
 * "Show all N results" pattern is preserved verbatim.
 */
export default function SearchResultsResponse({
  message,
  results,
  parsedFilters,
}: SearchResultsResponseProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? results : results.slice(0, 3)
  const hiddenCount = results.length - 3

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{message}</p>
        {results.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {visible.map(r => (
              <DiscoverResultCard key={r.id} result={r} />
            ))}
            {!expanded && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="flex items-center gap-1 w-full justify-center py-2 text-xs font-medium text-[#8026FA] hover:text-[#924CEC] transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Show all {results.length} results
              </button>
            )}
          </div>
        )}
      </div>
      {parsedFilters && (
        <div className="mt-1.5 pl-1">
          <DiscoverFilterChips filters={parsedFilters} />
        </div>
      )}
    </>
  )
}
