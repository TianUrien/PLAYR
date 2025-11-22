import { useCallback, useEffect, useRef } from 'react'
import { Send } from 'lucide-react'

interface ComposerProps {
  value: string
  sending: boolean
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: () => Promise<void>
  onFocus: () => void
  maxLength?: number
  textareaId: string
  isMobile?: boolean
  immersiveMobile?: boolean
}

export function Composer({ value, sending, disabled, onChange, onSubmit, onFocus, maxLength = 1000, textareaId, isMobile = false, immersiveMobile = false }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  const composerPositionClass = isMobile && immersiveMobile
    ? 'chat-fixed-composer fixed bottom-0 left-0 right-0 z-40'
    : 'relative'

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const nextHeight = Math.min(160, Math.max(48, textarea.scrollHeight))
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    syncHeight()
  }, [syncHeight, value])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void onSubmit()
    }
  }

  return (
    <form
      className={`${composerPositionClass} flex-shrink-0 border-t border-gray-100 bg-white/95 px-4 pt-3.5 pb-[calc(var(--chat-safe-area-bottom,0px)+0.875rem)] backdrop-blur shadow-[0_-1px_0_rgba(15,23,42,0.05)] md:px-6 md:py-4`}
      onSubmit={event => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <div className="flex items-end gap-3 md:gap-4">
        <div className="relative flex-1">
          <label htmlFor={textareaId} className="sr-only">
            Message
          </label>
          <textarea
            ref={textareaRef}
            id={textareaId}
            value={value}
            rows={1}
            maxLength={maxLength}
            placeholder="Type a message..."
            inputMode="text"
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            autoCapitalize="sentences"
            spellCheck
            onFocus={onFocus}
            onKeyDown={handleKeyDown}
            onChange={event => onChange(event.target.value)}
            className="chat-textarea w-full resize-none rounded-xl border border-transparent bg-gray-100 px-4 py-3 text-base leading-relaxed shadow-inner outline-none transition focus:border-purple-200 focus:bg-white focus:ring-2 focus:ring-purple-100 md:rounded-2xl md:px-5 md:py-3 touch-manipulation"
          />
          <div className="pointer-events-none absolute bottom-2 right-3 text-xs font-medium text-gray-400 md:bottom-2.5 md:right-3">
            {value.length}/{maxLength}
          </div>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white shadow-lg transition-all duration-200 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-60 md:h-12 md:w-12"
          aria-label="Send message"
        >
          {sending ? (
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <Send className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </form>
  )
}
