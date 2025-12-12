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
    const nextHeight = Math.min(160, Math.max(44, textarea.scrollHeight))
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
      className={`${composerPositionClass} flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 md:px-5`}
      onSubmit={event => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <div className="flex items-end gap-2">
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
            className="w-full resize-none rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 pr-16 text-[15px] leading-snug outline-none transition placeholder:text-gray-400 focus:border-purple-300 focus:bg-white focus:ring-2 focus:ring-purple-100"
          />
          <div className="pointer-events-none absolute bottom-2.5 right-4 text-[11px] font-medium text-gray-400">
            {value.length}/{maxLength}
          </div>
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md transition-all hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
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
