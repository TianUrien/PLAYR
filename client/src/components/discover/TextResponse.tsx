import type { SuggestedAction } from '@/hooks/useDiscover'
import ActionChipRow from './ActionChipRow'

interface TextResponseProps {
  message: string
  suggestedActions?: SuggestedAction[]
  onAction: (action: SuggestedAction) => void
}

/**
 * Plain assistant text bubble + optional chip row underneath. Used for:
 *   - greetings ("Hi") — single chip "What can you do?"
 *   - self-advice ("Who should I connect with?") — 3 role-aware chips
 *   - knowledge answers — no chips
 *   - any back-compat / undefined-kind message — no chips
 *
 * The chip-or-no-chip decision is the backend's call; this component just
 * renders whatever it's given.
 */
export default function TextResponse({ message, suggestedActions, onAction }: TextResponseProps) {
  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl rounded-tl-md px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[14px] text-gray-800 leading-[1.55] whitespace-pre-line">{message}</p>
      {suggestedActions && suggestedActions.length > 0 && (
        <ActionChipRow actions={suggestedActions} onAction={onAction} />
      )}
    </div>
  )
}
