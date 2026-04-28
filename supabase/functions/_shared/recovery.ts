/**
 * Phase 1A — Recovery query detection.
 *
 * Pure function. Decides whether a short user follow-up like "what should I
 * do?" or "so what now?" is shaped like a recovery question — i.e. the user
 * is asking for help moving forward after the previous turn (typically a
 * no_results or soft_error).
 *
 * Detection alone doesn't trigger recovery mode. The caller must combine
 * this with `recovery_context.last_kind ∈ {'no_results', 'soft_error'}`. The
 * combination is what gates the LLM short-circuit in `nl-search/index.ts`.
 *
 * Tight by design — false positives push the user into a deterministic
 * recovery response when an LLM call would have been better. The patterns
 * below match short, generic follow-ups only (≤6 words, no concrete entity
 * or filter mentioned). Substantive questions like "what about Argentina?"
 * or "how do I improve my profile?" must NOT match.
 */

const RECOVERY_PATTERNS: RegExp[] = [
  // "what should I do?", "what do i do now?", "so what should I do"
  /^\s*(so\s+)?what\s+(should|do|can|would|could|might)\s+i\s+do(\s+(now|next|then|else))?\??\s*$/i,
  // "so what now?", "what now?", "what next?"
  /^\s*(so\s+)?(what\s+)?(now|next|else)\s*\??\s*$/i,
  // "now what?" — order matters, separate pattern.
  /^\s*now\s+what\s*\??\s*$/i,
  // "any other ideas?" / "any other options?" / "any suggestions?"
  /^\s*any\s+(other\s+)?(ideas?|options?|suggestions?|recommendations?)\??\s*$/i,
  // bare confirmations / fillers — "ok?", "alright", "hmm"
  /^\s*(ok|okay|hmm+|alright|then|yeah)\s*\??\s*$/i,
  // "and?" / "so?"
  /^\s*(and|so)\s*\??\s*$/i,
  // "help" / "help me"
  /^\s*help(\s+me)?\s*\??\s*$/i,
  // "what else?", "anything else?"
  /^\s*(what|anything)\s+else\s*\??\s*$/i,
  // "what should I try?"
  /^\s*what\s+(should|can|do|could)\s+i\s+(try|search|look\s+for)\??\s*$/i,
]

export function detectRecoveryQuery(query: string): boolean {
  const q = query.trim()
  // Recovery shapes are short. Anything longer than ~60 chars is almost
  // certainly a substantive question and should go to the LLM.
  if (q.length === 0 || q.length > 60) return false
  return RECOVERY_PATTERNS.some(p => p.test(q))
}
