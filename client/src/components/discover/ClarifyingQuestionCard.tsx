import type { ClarifyingOption } from '@/hooks/useDiscover'

interface ClarifyingQuestionCardProps {
  question: string
  options: ClarifyingOption[]
  onPick: (option: ClarifyingOption) => void
}

/**
 * Renders a clarifying-question response. Backend hasn't started emitting
 * `kind: 'clarifying_question'` yet — that's PR-4 — but the component is
 * here so PR-4 is a one-line wire-up at the dispatcher.
 *
 * Anatomy: question text + 2-4 disambiguation pills. Tapping a pill submits
 * the routed_query as a new user message.
 */
export default function ClarifyingQuestionCard({
  question,
  options,
  onPick,
}: ClarifyingQuestionCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
      <p className="text-sm text-gray-800 leading-relaxed">{question}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Disambiguation options">
        {options.map((option, idx) => (
          <button
            key={`${option.label}-${idx}`}
            type="button"
            onClick={() => onPick(option)}
            className="
              inline-flex items-center
              px-3.5 py-1.5
              rounded-full
              border border-[#8026FA]/30 bg-[#8026FA]/5
              text-xs font-semibold text-[#8026FA]
              hover:bg-[#8026FA]/10 hover:border-[#8026FA]/50
              active:bg-[#8026FA]/20
              transition-colors
              focus:outline-none focus:ring-2 focus:ring-[#8026FA]/30
            "
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
