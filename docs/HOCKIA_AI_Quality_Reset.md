# HOCKIA AI — Product Quality Reset

**Status:** PROPOSAL — not yet approved for implementation.
**Drafted:** 2026-04-28, after the screenshot-driven product review.
**Replaces (in priority order):** the capability-first ordering in [HOCKIA_AI_Phase1_Proposal.md](./HOCKIA_AI_Phase1_Proposal.md). Quality reset comes BEFORE most of that proposal's items. See "Phase 1 reframe" at the bottom for what's resequenced.

> The bar is not "does the backend route clubs correctly?" The bar is: does the user feel guided, understood, and helped?

Phase 0 fixed a real backend bug (mixed-result entity routing). It did not improve the user-facing experience. The screenshot below the line — harsh red error card, generic dead-end advice, "I couldn't find any clubs matching that" with no recovery, conversation context lost across turns — proves it. This doc is the plan to fix that.

---

## 1. Diagnosis (rooted in the actual screenshot)

The screenshot shows four distinct failures in 90 seconds:

1. **First turn: hard error.** "Search is temporarily unavailable. Please try again in a moment." — rendered as a harsh red `AlertCircle` block with a `Retry` link. This is the [DiscoverChat.tsx:76-95](../client/src/components/DiscoverChat.tsx#L76-L95) error path. It surfaces only when both the LLM call AND the keyword fallback fail (the doubly-degraded path in [nl-search/index.ts:152-200](../supabase/functions/nl-search/index.ts#L152-L200)). Today the UI gives no indication that this is rare or recoverable — it just looks broken.

2. **Generic advice.** After the retry, "As a player with a complete profile, you could connect with coaches who specialize in midfield or defence. Also, consider connecting with players from clubs you're interested in joining!" — content is fine but ends as a wall of text with zero next-action affordance. The user is left holding the keyboard.

3. **No-results dead-end.** "Which club do you recommend?" returns `total: 0` with `enforced_role=club, effective_gender=Women` (from UserContext seeding). The UI renders only the bare `ai_message` ("I couldn't find any clubs matching that.") plus two informational filter chips (`Club`, `Women`). The user can't tell *what was searched*, *why no results*, or *what to try next*. The filter chips are visual context, not interactive.

4. **Lost conversation context + repeat error.** "So, what should I do?" — clearly a follow-up to the failed search. The model treats it as an isolated query, hits the LLM, errors again, renders the same harsh red block. There is no "your last search returned 0 results, try…" handoff. The conversation has no memory of what just happened, so it can't recover.

### Root causes (architectural, not cosmetic)

- **The response is a single string.** Backend returns `{ ai_message: string, data: [], parsed_filters }`. There's no semantic shape — no "this is a no-results", "this is a soft error", "this is a recovery". So the frontend can't render different UI for different states. Every assistant message is rendered as a text bubble or a red block. There's no third option.
- **The frontend is dumb about state.** No-results = same component as has-results. Error = different component but only one variant (harsh red). The frontend has no way to know "the user is recovering from a failed search" — the state isn't carried.
- **No suggested-action primitive exists.** Filter chips are read-only visual tags. There's nothing in the codebase today that says "tap this chip → submits 'show all clubs' as a new query."
- **Conversation context is shape-blind.** The `history` array sent to the LLM is `[{role, content}]` — just the message strings. No metadata about the *kind* of last turn (search/no-results/error), the filters that were applied, or what entity the user was trying to find. So the LLM literally cannot detect "the previous search failed, this is a recovery question."

These four causes generate the four failures in the screenshot. Fixing the cosmetics without fixing the causes won't last.

---

## 2. Product principles

The new bar — every assistant response must do at least ONE of these four things, or the response is not good enough:

1. **Give a useful answer.** (knowledge + self-reflection — already works for happy paths)
2. **Show relevant results.** (search results — works when there are matches)
3. **Ask a smart clarifying question.** (when the router lands `medium` confidence)
4. **Offer the next best action.** (always — when none of the above fit, suggest a forward step)

If a response does NONE of those, it's a dead-end and we've failed the user.

Specific commitments derived from the principle:

- **No bare apologies.** "I couldn't find any clubs matching that." is not allowed alone. Always pair with at least one suggested action.
- **No technical error language.** "Search is temporarily unavailable" is debug output. We never expose it to users.
- **No isolated turns after a failure.** If the previous turn was no-results or error, the next turn must explicitly recognize that and propose recovery.
- **No generic walls of text.** Long advice is broken into a structured response with chips for the user to act on.

---

## 3. The architectural change: structured response shape

The single-string `ai_message` becomes a typed envelope. This is the foundation for everything else.

### New backend response

```ts
interface AssistantResponse {
  // The message kind drives which UI component renders it.
  kind: 'text' | 'search_results' | 'no_results' | 'soft_error' | 'clarifying_question' | 'canned_redirect'

  // Conversational message (always present, used for screen readers + history).
  message: string

  // Search-specific (only for kind=search_results / no_results).
  results?: DiscoverResult[]
  total?: number
  parsed_filters?: ParsedFilters

  // What the backend actually enforced (for no-results explanations).
  applied?: {
    entity: 'clubs' | 'players' | 'coaches' | 'brands' | 'umpires' | null
    gender: string | null
    location: string | null
    age?: { min?: number; max?: number }
    role_summary: string  // human-readable: "women's clubs"
  }

  // Suggested next actions — chips the user can tap to submit a follow-up.
  // Each chip is a labeled new-query intent, NOT a free-form button.
  suggested_actions?: Array<{
    label: string                  // "Broaden search"
    intent: SuggestedActionIntent  // discriminated union, see below
  }>

  // For clarifying questions: the candidate disambiguations.
  clarifying_options?: Array<{
    label: string                  // "Clubs"
    routed_query: string           // the query we'll re-submit with this disambiguation
  }>

  // Telemetry + recovery hints (not rendered, used by the next turn's prompt).
  recovery_hint?: {
    kind: 'no_results' | 'error'
    last_entity: string
    last_filters: ParsedFilters
  }
}

type SuggestedActionIntent =
  | { type: 'broaden_search'; drop: ('gender' | 'location' | 'age')[] }
  | { type: 'search_country'; entity: string }
  | { type: 'find_opportunities' }
  | { type: 'find_coaches' }
  | { type: 'browse_marketplace' }
  | { type: 'improve_profile' }
  | { type: 'show_all'; entity: string }
  | { type: 'retry' }
  | { type: 'free_text'; query: string }
```

### Conversation history shape

Today: `[{role, content}]` — just strings.

After: each assistant turn also stores its `kind`, `applied`, and `recovery_hint`. When building the next turn's prompt, the edge function can detect "previous turn was no_results with applied.entity='clubs'" and inject a recovery instruction into the system prompt: "The user's last search returned 0 results for women's clubs. If their next message is a follow-up like 'so what now?', focus on recovery options — broadening, country search, opportunities — not generic advice."

This is the single most important architectural change in the doc. Once we have it, every other improvement falls out naturally.

---

## 4. The five UX patterns (matching your specific requirements)

### 4.1 Helpful no-results card

**When:** `kind: 'no_results'`. Search ran, enforced filters, returned 0 matches.

**Anatomy:**
- Top line: what was searched, in plain language. "I searched for women's clubs based on your profile."
- Reason: "I didn't find a strong match yet." (no "couldn't find" finality)
- Applied filters as visual chips (existing component, repurposed)
- 2–4 action chips (mandatory — never zero)

**Example copy (player searches clubs, gender auto-seeded, 0 results):**
```
I searched for women's clubs based on your profile, but I didn't find a
strong match yet. We can broaden the search or look at it differently.

[Show all clubs]  [Search by country]  [Remove gender filter]  [Find opportunities]
```

**Example copy (player searches coaches, no specialization specified, 0 results in their country):**
```
No coaches matched in your country. Coaches travel — want me to widen the
search internationally, or filter by specialization?

[Search internationally]  [By specialization]  [Find clubs hiring]
```

The action chips are deterministic — generated by the backend based on the applied filters, not by the LLM. This makes them reliable.

### 4.2 Soft error card

**When:** `kind: 'soft_error'`. The LLM call timed out, hit rate-limit, or both LLM + keyword fallback failed.

**Anatomy:**
- Calm tone, no harsh red block.
- Subtle inline icon (warning, gray-or-amber, not red).
- One-line acknowledgment: "I had trouble with that one."
- Recovery actions, not just "retry."

**Example copy:**
```
I had trouble with that one — let's try a slightly different angle.

[Retry]  [Broaden search]  [Browse opportunities]  [Start over]
```

Visual: same card shell as a normal assistant message, with a small inline icon. The harsh red block we ship today is reserved for *truly* critical states (account banned, abuse-rate-limited) — and even those should be presentable.

### 4.3 Suggested next-action chips

The new interaction primitive. Lives below every assistant message that benefits from it.

- **After a normal answer** ("Who should I connect with?"): chips for the most likely next intent — `Find clubs for me`, `Find coaches`, `Improve my profile`, `Find opportunities`. Role-aware: brand sees `Find ambassadors`, `Browse Marketplace`.
- **After no-results:** `Broaden search`, `Search by country`, `Show all clubs`, `Find opportunities`.
- **After error:** `Retry`, `Broaden search`, `Browse opportunities`, `Start over`.
- **After search results land:** `Refine results`, `Show only U21`, `Filter to Spain`, `Sort by recently active`.

Behavior: tapping a chip submits a new user message (so the conversation history reflects it) and the AI responds. No silent state changes — the conversation is the source of truth.

The chips are **deterministic** for no-results and error states (backend computes them from applied filters and user role). The chips are **LLM-generated** for "follow up after a normal answer" — and only kept if they pass a quality gate (3 max, ≤30 chars each, deduplicated against the message body). If the LLM produces no good chips, we omit chips rather than ship bad ones.

### 4.4 Better answer format

For self-reflection / advice / next-action questions, replace walls of text with a structured response:

**Before:**
> "As a player with a complete profile, you could connect with coaches who specialize in midfield or defence. Also, consider connecting with players from clubs you're interested in joining!"

**After:**
> "Three concrete next steps for a player with your profile:
> 1. **Connect with clubs** that match your country and league
> 2. **Reach coaches** who specialize in your position
> 3. **Build visibility** — references, video, career history
>
> Want me to start with one?
>
> [Find clubs for me]  [Find coaches]  [Improve my profile]"

The system prompt gets a "STRUCTURED ANSWER FORMAT" section that requires self-reflection responses to use a 3-bullet pattern with action chips. Backend strips bare paragraphs from these answer types and reformats if the LLM regresses.

### 4.5 Context-aware follow-up behavior

The recovery primitive. If `messages[-2].kind === 'no_results' || 'soft_error'` AND the new user message is a recovery-shaped query ("so what now?", "what should I do?", "and?", "ok"), the edge function injects a SYSTEM PROMPT addendum:

```
RECOVERY MODE: The user's previous search returned 0 results (women's clubs).
Their next message is a follow-up. Focus the response on recovery options
specific to that previous search, not on generic advice. Use the no_results
response shape with applied.entity="clubs" and suggest broadening filters,
country search, or alternative entities.
```

The router detects "recovery-shaped query" via a small regex set: `^(so|and|ok|now)?\s*(what (should|do|can) i\s)?(do|now|next|else)?\s*[?]?$` — short, post-failure follow-ups. If the regex matches AND the previous turn was a failure, recovery mode kicks in.

This costs zero extra LLM tokens (the addendum replaces some existing prompt content, doesn't add to it). The behavior is testable end-to-end with a fixture set of "previous-turn-failed → next-turn-is-recovery" scenarios.

---

## 5. Component library

New React components to build (in `client/src/components/discover/`):

| Component | Renders | Replaces |
|---|---|---|
| `<AssistantMessage />` | dispatcher — picks one of the below by `kind` | the inline render in [DiscoverChat.tsx:67-115](../client/src/components/DiscoverChat.tsx#L67-L115) |
| `<TextResponse />` | plain assistant text + optional action chips | the `status: 'complete'` text path |
| `<SearchResultsResponse />` | text + filter chips + result list + refine chips | the `results.length > 0` path |
| `<NoResultsCard />` | applied filters + reason + action chips | new (today: bare text) |
| `<SoftErrorCard />` | calm tone + retry + recovery actions | the harsh red `AlertCircle` block |
| `<ClarifyingQuestionCard />` | question text + 2–4 disambiguation chips | new (today: medium-confidence falls through to LLM) |
| `<ActionChipRow />` | horizontal row of suggested-action chips with icon support | new |
| `<AppliedFiltersStrip />` | the existing filter chips, made interactive (tap to remove) | the read-only [DiscoverFilterChips.tsx](../client/src/components/DiscoverFilterChips.tsx) |
| `<RecoveryBanner />` | optional 1-line "based on your last search" prefix | new |

`<AssistantMessage />` is the dispatcher. Everything else is a leaf. The existing `<DiscoverResultCard />` stays — it's actually fine for individual profile cards. We're not touching that.

Visual polish goals (vs. the screenshot):

- **Card shell:** softer shadow, slightly more padding, border-radius matching the rest of the app
- **Action chips:** filled pills with subtle icons (Sparkles for AI suggestions, Search for broaden, MapPin for country, Briefcase for opportunities)
- **Soft errors:** amber-50 background, amber-700 icon, no red
- **No-results:** white card with applied filters in a strip, recovery actions below
- **Spacing:** every assistant message gets a "what to do next" affordance row underneath; spacing between message and chips is 8px, between chips is 6px

---

## 6. Backend changes

In `supabase/functions/nl-search/index.ts`:

1. **Response shape upgrade.** Replace `{ ai_message, data, parsed_filters, summary }` with the `AssistantResponse` envelope above. Keep the old fields as a back-compat layer for one release if needed (frontend reads new fields, falls back to old).

2. **Apply summary.** When `enforcedRole` is set, build the `applied` block deterministically:
   ```ts
   const applied = {
     entity: enforcedRole ? `${enforcedRole}s` : null,
     gender: effectiveGender,
     location: baseLocationText,
     age: parsed.min_age || parsed.max_age ? { min: parsed.min_age, max: parsed.max_age } : undefined,
     role_summary: buildRoleSummary(enforcedRole, effectiveGender, baseLocationText),
   }
   // buildRoleSummary returns "women's clubs in Spain", "U21 defenders", etc.
   ```

3. **Suggested actions generator.** A new pure module `_shared/suggested-actions.ts` maps `(kind, applied, userContext)` → `Array<SuggestedAction>`. Deterministic for `no_results` and `soft_error`; LLM-generated (with quality gate) for `text`. ~150 lines, fully unit-testable.

4. **Recovery mode prompt.** When the conversation history's last assistant turn has `kind in ['no_results', 'soft_error']` AND the new query matches the recovery regex, append a `RECOVERY MODE` section to the system prompt. Already-implemented `IntentHint` plumbing handles this cleanly — just a new case.

5. **Soft error vs. hard error.** Today every catch-block returns 500. New rule: timeouts, rate-limits, transient 5xx → return 200 with `kind: 'soft_error'`. Hard errors (auth failure, malformed body, RPC failure on a 200-OK retry) → keep 500. The frontend renders `kind: 'soft_error'` like a normal message, not a red block.

6. **Conversation history enriches.** `discovery_events.parsed_filters._meta` already stores routing decisions per turn. Frontend will store `kind`, `applied`, `recovery_hint` per assistant message in the Zustand store and replay the structured shape into the next request's `history` array.

### Gotchas I want to flag

- **The history payload size grows.** Each assistant turn now carries metadata. Capping at last-10 turns + only including `kind`/`applied` (not the result list) keeps it bounded.
- **LLM-generated chips need a quality gate.** Empirically Gemini 2.5 Flash will sometimes return chips like "What is HOCKIA?" — generic and useless. The gate: ≤3 chips, each ≤30 chars, no question marks (chips are imperatives), deduped against the message body. If 0 chips pass, ship without chips rather than ship bad chips.
- **The structured-answer-format prompt rule will sometimes regress.** The LLM might produce numbered bullets in plain text without using the discriminator. Backend post-processor should detect "looks like a numbered list" and ensure chips are appended deterministically.

---

## 7. Frontend changes

In `client/src/`:

1. **`DiscoverChatMessage` type** ([useDiscover.ts:70-80](../client/src/hooks/useDiscover.ts#L70-L80)) extends with `kind`, `applied`, `suggested_actions`, `clarifying_options`, `recovery_hint`. Existing fields stay.

2. **`<AssistantMessage />` dispatcher.** New component at `client/src/components/discover/AssistantMessage.tsx`. Reads `msg.kind`, picks the right leaf component. The current inline render in [DiscoverChat.tsx:67-115](../client/src/components/DiscoverChat.tsx#L67-L115) becomes 3 lines: `if (msg.role === 'user') return <UserMessage />; return <AssistantMessage msg={msg} onAction={handleAction} />;`.

3. **Action handler.** `handleAction(intent: SuggestedActionIntent)` in `useDiscoverChat`. Translates an intent into a new user query and submits it. For `type: 'free_text'`, just submits the literal string. For `type: 'broaden_search'`, builds a query like "Find clubs (broaden the search)" + a metadata flag the backend uses to drop the gender/location/age filter from the applied set on this turn.

4. **`<NoResultsCard />`, `<SoftErrorCard />`, `<ActionChipRow />`, `<ClarifyingQuestionCard />`.** Four new leaf components. Each ~40-80 lines. Stories or unit tests for each.

5. **History payload changes.** When building the `history` array in `sendMessage`, include `kind` and `applied` per message so the backend has the context.

6. **Visual polish pass.** Updated card shadows, padding, color tokens, icon set. Probably ~1 day of pure design work; can ship behind a feature flag.

7. **Storybook / fixtures.** Build the components against fixture data first, ship the backend separately. Lets us iterate on look-and-feel without an LLM round-trip in the dev loop.

---

## 8. Implementation sequencing

Three packages, each independently shippable:

### Package A — Quick wins (1-2 days each, ship this week)

1. **Soft error replacement.** Replace the harsh red block in [DiscoverChat.tsx:76-95](../client/src/components/DiscoverChat.tsx#L76-L95) with a calm card. Backend returns `kind: 'soft_error'` for transient failures. (~1 day, lowest-risk, biggest immediate visual upgrade.)
2. **Static no-results actions.** Even before the structured response shape lands, hard-code 4 action chips in the no-results path of `DiscoverChat.tsx`: `Show all clubs`, `Search by country`, `Remove gender filter`, `Find opportunities`. Submit them as new user queries. Crude but eliminates the dead-end. (~1 day.)
3. **Copy fixes.** "I couldn't find any clubs matching that" → "I searched for women's clubs based on your profile, but I didn't find a strong match yet. Want me to broaden it?" The backend already has `enforcedRole` and `effectiveGender` — just plumb them into the message template. (~half day.)

After Package A, the screenshot can't happen anymore. The user always has a forward step.

### Package B — Structured response (1 week)

4. **Backend response envelope.** New `AssistantResponse` shape with `kind`, `applied`, `suggested_actions`. Back-compat layer preserves `ai_message` / `data` for one release. (~2 days.)
5. **Frontend dispatcher + leaf components.** `<AssistantMessage />`, `<NoResultsCard />`, `<SoftErrorCard />`, `<TextResponse />`, `<ActionChipRow />`. Built against fixture data. (~3 days.)
6. **Action chip handler.** `handleAction` plumbing in `useDiscoverChat`. (~1 day.)

After Package B, every message kind has a polished UI; the chip primitive exists end-to-end.

### Package C — Conversation continuity (3–4 days)

7. **History payload enrichment.** Frontend stores `kind`/`applied`/`recovery_hint` per turn. Backend reads them. (~1 day.)
8. **Recovery mode prompt.** Detection regex + system-prompt addendum. (~1 day.)
9. **Clarifying-question UX.** When router lands `medium` confidence, return `kind: 'clarifying_question'` with 2-4 disambiguation chips. (~1 day.)
10. **Structured-answer format for self-reflection.** Prompt rule + post-processor. (~1 day.)

After Package C, the AI feels like it remembers what just happened and responds intelligently to follow-ups.

### Out of scope (defer or drop)

- Streaming responses — moved to Package D (Phase 1 capability).
- Real opportunity / product search — Phase 1 capability.
- Typed result cards beyond profiles — Phase 1 capability.
- Sonnet experiment — Phase 1 capability, after this whole reset.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| LLM-generated action chips are garbage. | Quality gate (≤3 chips, ≤30 chars, no question marks, dedupe vs message). If 0 pass → ship without chips. Telemetry on chip-acceptance rate; switch to deterministic if quality < 70%. |
| Structured-response shape breaks existing behavior. | One release of back-compat: backend returns BOTH old `ai_message` and new `kind`+`message`. Frontend reads new, falls back to old. Drop back-compat in the next release after monitoring. |
| Recovery-mode regex over-fires. | Tight regex (only matches recovery-shaped follow-ups: "so what now?", "and?", "ok"). If it triggers on a fresh non-recovery query, the backend still returns a normal response — just with a slightly biased prompt. Unit tests for false-positive cases. |
| Action chips trigger LLM calls and balloon costs. | Most chips submit as new queries (one LLM call each). Same cost model as today's chat. Canned-redirect chips (`Find opportunities`) bypass LLM entirely (already canned). Net: ~1.2× current LLM volume per session in the worst case. |
| No-results action generation feels formulaic. | Hand-write the action sets per `(entity × applied_filters)` combination. ~12-15 cases total. Better than LLM-generated and predictable. Future: add LLM-generated for the long tail. |
| The bar keeps rising. | Telemetry on every chip click + every "dead-end" message (a turn with 0 results AND 0 chips AND no recovery follow-up). When dead-end rate < 5% and chip-click rate > 30%, the reset has worked. |

---

## 10. Phase 1 reframe

The original [Phase 1 proposal](./HOCKIA_AI_Phase1_Proposal.md) had 8 items prioritized by capability. Many of them — items 6 (follow-up chips) and 7 (clarifying-question UX) — are now subsumed into this Quality Reset and ship FIRST, not last. The capability-first items below this Reset are descoped or resequenced:

| Original Phase 1 item | Status after Quality Reset |
|---|---|
| #1 Streaming responses | Defer to Phase 1B (after Reset). Streaming is polish; the structured response shape is more impactful. |
| #2 Status messages | Defer to Phase 1B. Bundles with streaming. |
| #3 Real opportunity search | Defer to Phase 1B. Canned redirect is fine until the chat surface is polished. |
| #4 Real product search | Defer to Phase 1B. Same reasoning. |
| #5 Typed result cards | **Subsumed** — the dispatcher pattern in Package B is exactly this for the existing entities (player/coach/club/brand). New typed cards (opportunity/product) come with Phase 1B. |
| #6 Follow-up chips | **Subsumed and promoted** — Package B ships chips end-to-end. |
| #7 Clarifying-question UX | **Subsumed** — Package C ships this. |
| #8 Sonnet experiment | Defer to Phase 1C, after Quality Reset is stable on Gemini. Same reasoning as before. |

**Recommended new order:**
1. **Quality Reset** (this doc) — Packages A, B, C.
2. **Phase 1B — Capability** — streaming, real opportunity/product search, typed cards for the new entities.
3. **Phase 1C — Sonnet experiment** — under a feature flag, A/B'd against the post-Reset baseline.

---

## What I want from you

If you approve the direction, the smallest meaningful first PR is **Package A** (quick wins: soft error + static no-results actions + copy fixes). It's 2-3 days, zero architectural risk, and would have eliminated 100% of the failures in the screenshot.

If you want the full structured-response upgrade, that's Packages A + B together — about a week. Best done as 2-3 PRs (envelope, dispatcher, polish).

Tell me which package to scope first and I'll write the implementation plan against the actual codebase.
