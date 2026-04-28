import type { AppliedSearch, SuggestedAction } from '@/hooks/useDiscover'
import ActionChipRow from './ActionChipRow'
import AppliedSearchStrip from './AppliedSearchStrip'

interface NoResultsCardProps {
  applied: AppliedSearch | null
  suggestedActions: SuggestedAction[]
  onAction: (action: SuggestedAction) => void
  /** Backend-provided fallback message — used only when applied is missing. */
  fallbackMessage?: string
}

/**
 * Calm no-results state. Eliminates the "I couldn't find any clubs matching
 * that." dead-end from the screenshot:
 *
 *   - Top: tiny strip showing what was searched (entity + filters).
 *   - Body: explains what happened in plain language, frames the chips below
 *     as "let's try this instead" rather than a finality.
 *   - Chips: deterministic next-actions from the backend's suggested-actions
 *     catalog. Tapping one submits a new user query.
 *
 * Never renders without at least one chip — the contract is: zero dead-ends.
 * If the chip array is empty, we still ship the calm copy + a generic chip
 * row pointing at "Find opportunities" / "Browse Marketplace" so the user
 * always has a forward step.
 */
export default function NoResultsCard({
  applied,
  suggestedActions,
  onAction,
  fallbackMessage,
}: NoResultsCardProps) {
  // Build the body copy from `applied`. When applied is missing (older row,
  // or fallback path), use the backend message verbatim.
  const summary = applied?.role_summary
  const headline = summary
    ? `I searched for ${summary} based on your profile, but I didn't find a strong match yet.`
    : (fallbackMessage || "I didn't find a match yet.")

  const subline = summary
    ? "Let's try a different angle — pick one below."
    : 'Pick one of these to keep going:'

  // Safety net: if backend didn't ship chips, give the user something useful.
  const actions: SuggestedAction[] = suggestedActions.length > 0
    ? suggestedActions
    : [
        { label: 'Find opportunities', intent: { type: 'free_text', query: 'Find opportunities for my position' } },
        { label: 'Browse Marketplace', intent: { type: 'free_text', query: 'Show me products' } },
      ]

  return (
    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
      {applied && <AppliedSearchStrip applied={applied} />}
      <p className="text-sm text-gray-800 leading-relaxed">{headline}</p>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed">{subline}</p>
      <ActionChipRow actions={actions} onAction={onAction} />
    </div>
  )
}
