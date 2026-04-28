import { Bot, AlertCircle, RotateCcw } from 'lucide-react'
import type { DiscoverChatMessage, SuggestedAction } from '@/hooks/useDiscover'
import { useDiscoverChat } from '@/hooks/useDiscover'
import CannedRedirectCard from './CannedRedirectCard'
import ClarifyingQuestionCard from './ClarifyingQuestionCard'
import NoResultsCard from './NoResultsCard'
import SearchResultsResponse from './SearchResultsResponse'
import SoftErrorCard from './SoftErrorCard'
import TextResponse from './TextResponse'

interface AssistantMessageProps {
  msg: DiscoverChatMessage
  /**
   * Legacy retry handler used while PR-3 still ships 5xx for transient
   * failures. Once PR-3 swaps the soft-error path to 200, this can be
   * removed and SoftErrorCard handles retry internally via the chip set.
   */
  onLegacyRetry?: (query: string) => void
  /** All messages in the chat — used by the legacy retry handler. */
  allMessages: DiscoverChatMessage[]
}

/** 3-dot typing indicator while the LLM call is in flight. */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  )
}

/**
 * Legacy hard-error inline rendering. Stays in PR-2 for the 5xx path
 * (where the frontend still throws before parsing the body and so never
 * reads `kind: 'soft_error'`). PR-3 swaps the backend to 200 and the
 * dispatcher routes those through `<SoftErrorCard />` instead.
 */
function LegacyErrorBlock({
  msg,
  allMessages,
  onLegacyRetry,
}: {
  msg: DiscoverChatMessage
  allMessages: DiscoverChatMessage[]
  onLegacyRetry?: (query: string) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <p className="text-sm text-red-600 flex-1">{msg.content}</p>
        {onLegacyRetry && (
          <button
            type="button"
            onClick={() => {
              const idx = allMessages.findIndex(m => m.id === msg.id)
              const prevUser = allMessages
                .slice(0, idx)
                .reverse()
                .find(m => m.role === 'user')
              if (prevUser) onLegacyRetry(prevUser.content)
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#8026FA] hover:bg-[#8026FA]/5 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Assistant-side message dispatcher. Reads `msg.kind` (set by the backend
 * envelope shipped in PR-1) and picks the right leaf component. Falls back
 * to plain text for messages without a kind (back-compat with cached chat
 * state from before Phase 1A).
 */
export default function AssistantMessage({
  msg,
  onLegacyRetry,
  allMessages,
}: AssistantMessageProps) {
  const submitAction = useDiscoverChat(s => s.submitAction)

  const handleAction = (action: SuggestedAction) => submitAction(action.intent)

  const body = (() => {
    if (msg.status === 'sending') {
      return (
        <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
          <TypingIndicator />
        </div>
      )
    }

    if (msg.status === 'error') {
      // Backend may return `kind: 'soft_error'` in the body of a 5xx response,
      // but supabase-js currently throws before parsing the body — so the
      // legacy block stays the visible fallback until PR-3.
      return (
        <LegacyErrorBlock
          msg={msg}
          allMessages={allMessages}
          onLegacyRetry={onLegacyRetry}
        />
      )
    }

    // Successful response — pick by kind.
    switch (msg.kind) {
      case 'no_results':
        return (
          <NoResultsCard
            applied={msg.applied ?? null}
            suggestedActions={msg.suggested_actions ?? []}
            onAction={handleAction}
            fallbackMessage={msg.content}
          />
        )

      case 'soft_error':
        // Wired in PR-3 — for now this branch only fires if the backend ever
        // returns kind=soft_error in a 200 body (it doesn't yet, but the
        // dispatcher is ready).
        return (
          <SoftErrorCard
            message={msg.content}
            suggestedActions={msg.suggested_actions ?? []}
            onAction={handleAction}
          />
        )

      case 'clarifying_question':
        return (
          <ClarifyingQuestionCard
            question={msg.content}
            options={msg.clarifying_options ?? []}
            onPick={(option) => submitAction({ type: 'free_text', query: option.routed_query })}
          />
        )

      case 'canned_redirect':
        return <CannedRedirectCard message={msg.content} />

      case 'results':
        return (
          <SearchResultsResponse
            message={msg.content}
            results={msg.results ?? []}
            parsedFilters={msg.parsed_filters ?? null}
          />
        )

      case 'text':
      default:
        return (
          <TextResponse
            message={msg.content}
            suggestedActions={msg.suggested_actions}
            onAction={handleAction}
          />
        )
    }
  })()

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#8026FA] to-[#924CEC] flex items-center justify-center mt-0.5">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] sm:max-w-[75%]">
        {body}
      </div>
    </div>
  )
}
