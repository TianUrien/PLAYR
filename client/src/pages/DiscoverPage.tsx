import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, Send, Loader2, RotateCcw } from 'lucide-react'
import { useDiscoverChat } from '@/hooks/useDiscover'
import DiscoverChat from '@/components/DiscoverChat'
import { Header } from '@/components'

const EXAMPLE_QUERIES = [
  'Find U25 defenders with a EU passport and 2+ references',
  'Show female defenders open to play',
  'Find men goalkeepers from New Zealand',
]

export default function DiscoverPage() {
  const { messages, sendMessage, clearChat, isPending } = useDiscoverChat()
  const [input, setInput] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const hasMessages = messages.length > 0

  // Rotate placeholder text
  useEffect(() => {
    if (hasMessages) return
    const interval = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % EXAMPLE_QUERIES.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [hasMessages])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(120, Math.max(44, ta.scrollHeight))}px`
  }, [])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isPending) return
    sendMessage(trimmed)
    setInput('')
    // Reset textarea height after clearing
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px'
      }
    })
  }, [input, isPending, sendMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleExampleClick = (example: string) => {
    sendMessage(example)
  }

  const handleRetry = useCallback((query: string) => {
    // Remove the last error assistant message + its user message, then re-send
    sendMessage(query)
  }, [sendMessage])

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50 pt-[var(--app-header-offset)]">
      <Header />

      {/* Scrollable chat area */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-4">
          {!hasMessages ? (
            /* ── Welcome state ─────────────────────────────────────── */
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8026FA] to-[#924CEC] flex items-center justify-center mb-4 shadow-lg shadow-[#8026FA]/20">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Discover</h1>
              <p className="text-sm text-gray-500 text-center mb-8 max-w-xs">
                Ask me anything — search for players, coaches, clubs, and brands using natural language.
              </p>
              <div className="w-full max-w-sm space-y-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide text-center mb-2">
                  Try asking
                </p>
                {EXAMPLE_QUERIES.map(example => (
                  <button
                    type="button"
                    key={example}
                    onClick={() => handleExampleClick(example)}
                    className="w-full text-left p-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-[#8026FA] hover:bg-[#8026FA]/5 transition-colors"
                  >
                    <span className="text-gray-400 mr-1">&ldquo;</span>
                    {example}
                    <span className="text-gray-400 ml-1">&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Chat messages ─────────────────────────────────────── */
            <DiscoverChat messages={messages} onRetry={handleRetry} />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Composer (fixed bottom) ────────────────────────────────── */}
      <div className="border-t border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {/* New chat button when messages exist */}
          {hasMessages && (
            <div className="flex justify-center mb-2">
              <button
                type="button"
                onClick={clearChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-[#8026FA] hover:bg-[#8026FA]/5 rounded-full transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                New chat
              </button>
            </div>
          )}

          <div className="relative flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => {
                if (e.target.value.length <= 500) setInput(e.target.value)
              }}
              onKeyDown={handleKeyDown}
              placeholder={hasMessages ? 'Follow up or ask something new…' : EXAMPLE_QUERIES[placeholderIndex]}
              rows={1}
              disabled={isPending}
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#8026FA]/30 focus:border-[#8026FA]/50 focus:bg-white transition-all disabled:opacity-60 min-h-[44px] max-h-[120px]"
              enterKeyHint="send"
              autoCapitalize="sentences"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isPending || input.trim().length < 1}
              className="absolute right-2 bottom-1.5 w-9 h-9 flex items-center justify-center rounded-full bg-gradient-to-br from-[#8026FA] to-[#924CEC] text-white shadow-sm disabled:opacity-40 disabled:shadow-none hover:shadow-md transition-all"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
