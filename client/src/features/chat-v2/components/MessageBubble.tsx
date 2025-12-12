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
    <div className={cn('space-y-1', isGroupedWithPrevious ? '' : 'mt-2')}>
      {showDayDivider && (
        <div className="flex justify-center py-4">
          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-500 shadow-sm ring-1 ring-gray-200">
            {format(new Date(message.sent_at), 'EEEE, MMM d')}
          </span>
        </div>
      )}
      {showTimestamp && !showDayDivider && (
        <div className="text-center text-[11px] font-medium text-gray-400 py-2">
          {format(new Date(message.sent_at), 'MMM d, h:mm a')}
        </div>
      )}
      {isUnreadMarker && (
        <div className="flex items-center gap-3 py-3">
          <div className="flex-1 h-px bg-purple-200" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-purple-500">New</span>
          <div className="flex-1 h-px bg-purple-200" />
        </div>
      )}
      <div className={cn('flex', isMine ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'max-w-[75%] rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed sm:max-w-[65%]',
            isMine
              ? 'bg-gradient-to-br from-purple-500 to-purple-600 text-white'
              : 'bg-white text-gray-900 ring-1 ring-gray-200',
            isMine
              ? isGroupedWithPrevious ? 'rounded-tr-md' : ''
              : isGroupedWithPrevious ? 'rounded-tl-md' : ''
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          <div className={cn(
            'mt-1 flex items-center gap-1.5 text-[11px]',
            isMine ? 'justify-end' : ''
          )}>
            <span className={isMine ? 'text-white/70' : 'text-gray-400'}>{timestampLabel}</span>
            {isMine && (
              status === 'failed' ? (
                <span className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onRetry(message.id)}
                    className="rounded-full p-0.5 text-white/80 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
                    aria-label="Retry sending message"
                  >
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFailed(message.id)}
                    className="rounded-full p-0.5 text-white/80 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
                    aria-label="Delete failed message"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-white/70">
                  {status === 'sending' ? (
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  ) : message.read_at ? (
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </span>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
