import { format } from 'date-fns'
import { AlertCircle, Check, CheckCheck, Loader2, Trash2 } from 'lucide-react'
import type { ChatMessage, MessageDeliveryStatus } from '@/types/chat'
import { cn } from '@/lib/utils'

interface MessageBubbleProps {
  message: ChatMessage
  isMine: boolean
  status: MessageDeliveryStatus | undefined
  isGroupedWithPrevious: boolean
  showDayDivider: boolean
  showTimestamp: boolean
  isUnreadMarker: boolean
  onRetry: (id: string) => void
  onDeleteFailed: (id: string) => void
}

export function MessageBubble({
  message,
  isMine,
  status,
  isGroupedWithPrevious,
  showDayDivider,
  showTimestamp,
  isUnreadMarker,
  onRetry,
  onDeleteFailed
}: MessageBubbleProps) {
  const timestampLabel = format(new Date(message.sent_at), 'h:mm a')

  return (
    <div className="space-y-2">
      {showDayDivider && (
        <div className="flex justify-center pt-6">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            {format(new Date(message.sent_at), 'EEEE, MMM d')}
          </span>
        </div>
      )}
      {showTimestamp && (
        <div className="text-center text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {format(new Date(message.sent_at), 'MMM d, yyyy h:mm a')}
        </div>
      )}
      {isUnreadMarker && (
        <div className="flex items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-purple-500">
          --- NEW MESSAGES ---
        </div>
      )}
      <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[78%] rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed shadow-md md:max-w-[70%]',
            isMine
              ? 'bg-gradient-to-br from-[#6f4dfa] to-[#8f7bff] text-white'
              : 'bg-gray-100 text-gray-900 border border-gray-200 shadow-sm',
            !isMine && (isGroupedWithPrevious ? 'rounded-tl-2xl' : 'rounded-tl-sm')
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] tracking-wide">
            <p className={isMine ? 'text-white/80' : 'text-gray-500'}>{timestampLabel}</p>
            {isMine && (
              status === 'failed' ? (
                <span className="inline-flex items-center gap-1 text-rose-50">
                  <button
                    type="button"
                    onClick={() => onRetry(message.id)}
                    className="rounded-full border border-white/30 bg-white/10 p-1 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    aria-label="Retry sending message"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-rose-100" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFailed(message.id)}
                    className="rounded-full border border-white/30 bg-white/10 p-1 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    aria-label="Delete failed message"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-semibold text-purple-100">
                  {status === 'sending' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : message.read_at ? (
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {status === 'sending' ? 'Sending' : message.read_at ? 'Read' : 'Sent'}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
