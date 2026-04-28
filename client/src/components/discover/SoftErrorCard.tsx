import { AlertTriangle } from 'lucide-react'
import type { SuggestedAction } from '@/hooks/useDiscover'
import ActionChipRow from './ActionChipRow'

interface SoftErrorCardProps {
  /** Optional backend-provided message; we use a calm default if absent. */
  message?: string
  suggestedActions: SuggestedAction[]
  onAction: (action: SuggestedAction) => void
}

/**
 * Calm replacement for the harsh red "Search is temporarily unavailable" block.
 * Amber tone, small icon, recovery chips — never the only path. PR-2 defines
 * this component but it's not yet routable from the dispatcher because the
 * backend still returns 5xx for transient failures (PR-3 swaps to 200 +
 * `kind: 'soft_error'`, at which point this card lights up).
 */
export default function SoftErrorCard({ message, suggestedActions, onAction }: SoftErrorCardProps) {
  return (
    <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl rounded-tl-md px-4 py-3.5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-[14px] h-[14px] text-amber-600 flex-shrink-0 mt-[3px]" aria-hidden="true" />
        <p className="text-[14px] text-amber-900 leading-[1.55]">
          {message ?? "I had trouble with that one — let's try a different angle."}
        </p>
      </div>
      <ActionChipRow actions={suggestedActions} onAction={onAction} />
    </div>
  )
}
