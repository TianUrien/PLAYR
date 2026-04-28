import { ArrowRight, Briefcase, ShoppingBag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface CannedRedirectCardProps {
  message: string
}

/**
 * Phase 1A canned-redirect renderer. The backend's message text contains a
 * path like `/opportunities` or `/marketplace`; we detect it and render a
 * clear CTA button instead of leaving the user to find an inline link.
 *
 * Falls back to plain-text rendering if no recognized path is in the message
 * (defensive — the canned-redirect set is fixed in nl-search/index.ts).
 */
export default function CannedRedirectCard({ message }: CannedRedirectCardProps) {
  const navigate = useNavigate()

  // Match the canned redirect paths in nl-search/index.ts.
  let cta: { label: string; path: string; icon: typeof Briefcase } | null = null
  if (message.includes('/opportunities')) {
    cta = { label: 'Browse opportunities', path: '/opportunities', icon: Briefcase }
  } else if (message.includes('/marketplace')) {
    cta = { label: 'Open Marketplace', path: '/marketplace', icon: ShoppingBag }
  }

  return (
    <div className="bg-white border border-gray-200/80 rounded-2xl rounded-tl-md px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[14px] text-gray-800 leading-[1.55] whitespace-pre-line">{message}</p>
      {cta && (
        <button
          type="button"
          onClick={() => navigate(cta.path)}
          className="
            mt-3.5 inline-flex items-center gap-2
            min-h-[40px] px-4 py-2
            rounded-full
            bg-gradient-to-br from-[#8026FA] to-[#924CEC]
            text-white text-[12px] font-semibold tracking-[0.01em]
            shadow-sm shadow-[#8026FA]/20
            hover:shadow-md hover:shadow-[#8026FA]/30
            active:scale-[0.98] active:translate-y-px
            transition-all duration-150
            focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8026FA]/40
          "
        >
          <cta.icon className="w-3.5 h-3.5" aria-hidden="true" />
          {cta.label}
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
