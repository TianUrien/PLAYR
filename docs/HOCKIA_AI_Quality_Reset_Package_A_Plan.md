# HOCKIA AI Quality Reset — Package A Implementation Plan

**Status:** PLAN — awaiting approval before implementation.
**Source:** [HOCKIA_AI_Quality_Reset.md](./HOCKIA_AI_Quality_Reset.md). This is the "how" against the actual codebase.
**Bar:** after this package ships, the failures in the screenshot can't happen anymore — and the architectural foundation is in place for Package B to build on without rework.

---

## Scope summary

**In scope:**

1. Calm soft-error UI replacing the harsh red block.
2. Helpful no-results UI with 4 action chips, generated deterministically from applied filters + user role.
3. Minimal `kind`-tagged response envelope (additive — keeps existing fields for back-compat).
4. Action-chip primitive end-to-end (backend emits, frontend renders, tap re-submits as new user message).
5. Recovery mode — when the previous turn was no-results / soft-error and the new query is recovery-shaped, backend short-circuits with deterministic recovery copy + chips.
6. Lightweight clarifying-question response when the keyword router lands medium confidence (replaces today's silent LLM-trust path).
7. Self-advice responses ("Who should I connect with?") get 3 role-aware action chips appended.

**Out of scope (defer to Package B/1B/1C, per the Quality Reset doc):**

- Streaming responses + status messages.
- Real opportunity search / real product search (canned redirects stay).
- Typed result cards beyond the existing `<DiscoverResultCard />` (player/coach/club/brand all keep using it).
- LLM-generated suggested actions (everything in this package is deterministic from the backend).
- Refine-chips on successful results (`kind: 'results'` with non-empty data → no chips for now).
- Sonnet experiment.
- Localization (English only).
- Visual design tokens beyond what's needed for the new components.

---

## Data contract changes

### Backend response (additive — keep existing fields)

Today ([useDiscover.ts:57-66](../client/src/hooks/useDiscover.ts#L57-L66)):

```ts
interface DiscoverResponse {
  success: boolean
  data: DiscoverResult[]
  total: number
  has_more: boolean
  parsed_filters: ParsedFilters | null
  summary: string | null
  ai_message: string
  error?: string
}
```

After Package A — three new optional fields, all additive:

```ts
interface DiscoverResponse {
  // Existing fields unchanged ...
  success: boolean
  data: DiscoverResult[]
  total: number
  has_more: boolean
  parsed_filters: ParsedFilters | null
  summary: string | null
  ai_message: string
  error?: string

  // NEW — Phase 1A
  kind?: ResponseKind
  applied?: AppliedSearch | null
  suggested_actions?: SuggestedAction[]
  clarifying_options?: ClarifyingOption[]
}

type ResponseKind =
  | 'text'                  // generic chat reply — knowledge / greeting / self-advice
  | 'results'               // search returned matches
  | 'no_results'            // search ran, returned zero
  | 'soft_error'            // transient failure — recoverable, calm UI
  | 'clarifying_question'   // medium-confidence intent, ask user to disambiguate
  | 'canned_redirect'       // opportunity / product redirects (Phase 0 path)

interface AppliedSearch {
  entity: 'clubs' | 'players' | 'coaches' | 'brands' | 'umpires' | null
  gender_label: string | null    // "Women" / "Men"
  location_label: string | null  // "Spain" / "Madrid" — the human label, not the ID
  /** Human-readable role summary for UI: "women's clubs", "U21 defenders in Spain". */
  role_summary: string
}

interface SuggestedAction {
  /** Display label, ≤30 chars, imperative form. */
  label: string
  /**
   * What happens when the user taps the chip:
   * - { type: 'free_text', query } → submit `query` as a new user message
   * - { type: 'retry' }            → frontend resubmits the previous user query
   * - { type: 'clear' }            → frontend clears the chat
   */
  intent:
    | { type: 'free_text'; query: string }
    | { type: 'retry' }
    | { type: 'clear' }
}

interface ClarifyingOption {
  label: string         // "Clubs", "Players", "Coaches"
  routed_query: string  // the query we submit when this option is picked
}
```

`kind` is optional so older clients reading from cache see no breakage. The frontend treats `kind === undefined` as `kind: 'text'` with no chips (current behavior).

### Frontend chat-message store

Today ([useDiscover.ts:70-80](../client/src/hooks/useDiscover.ts#L70-L80)):

```ts
interface DiscoverChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  results?: DiscoverResult[]
  parsed_filters?: ParsedFilters | null
  total?: number
  timestamp: number
  status: 'sending' | 'complete' | 'error'
  error?: string
}
```

After:

```ts
interface DiscoverChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  results?: DiscoverResult[]
  parsed_filters?: ParsedFilters | null
  total?: number
  timestamp: number
  status: 'sending' | 'complete' | 'error'
  error?: string

  // NEW — Phase 1A
  kind?: ResponseKind
  applied?: AppliedSearch | null
  suggested_actions?: SuggestedAction[]
  clarifying_options?: ClarifyingOption[]
}
```

The `status: 'error'` path becomes mostly dead — soft errors come back as `status: 'complete'` with `kind: 'soft_error'`. Hard errors (5xx the backend can't recover from) still set `status: 'error'`, but those are rare; the new soft-error path catches the common cases.

### Request payload (recovery context)

Today: `{ query: string, history: HistoryTurn[] }`.

After: `{ query, history, recovery_context? }`

```ts
interface RecoveryContext {
  /** The kind of the last assistant turn, if any. */
  last_kind: ResponseKind
  /** What was applied in the last search. Only meaningful for no_results. */
  last_applied?: AppliedSearch
}
```

Frontend always sends `recovery_context` for the most recent assistant turn that was `no_results` or `soft_error`. Backend uses it to detect recovery-shaped queries.

`history` itself stays as `[{role, content}]` — it's still the LLM input, and the LLM doesn't need the metadata. `recovery_context` is the side channel for the recovery-mode logic.

---

## Files / components affected

### Backend

| File | Change |
|---|---|
| [supabase/functions/nl-search/index.ts](../supabase/functions/nl-search/index.ts) | Major. Build the `AssistantResponse` envelope at every return path. Read `recovery_context` from body. Emit suggested_actions + applied + kind. Add recovery short-circuit. Soft-error path returns 200 with `kind: 'soft_error'` instead of 500 for transient failures. |
| **NEW** `supabase/functions/_shared/suggested-actions.ts` | Pure module. Functions: `getNoResultsActions(applied, userRole)`, `getSoftErrorActions()`, `getSelfAdviceActions(userRole)`, `getRecoveryActions(lastApplied, userRole)`, `buildRoleSummary(applied)`. Deterministic, fully unit-testable. |
| **NEW** `supabase/functions/_shared/recovery.ts` | Pure module. `detectRecoveryQuery(query: string): boolean` regex-based, fully unit-testable. |
| [supabase/functions/_shared/llm-client.ts](../supabase/functions/_shared/llm-client.ts) | None for Package A. The `IntentHint` block already exists; we don't change the LLM call shape. |
| [supabase/functions/_shared/intent-router.ts](../supabase/functions/_shared/intent-router.ts) | None — the router is correct as-is. |

### Frontend

| File | Change |
|---|---|
| [client/src/hooks/useDiscover.ts](../client/src/hooks/useDiscover.ts) | Type extension on `DiscoverChatMessage` + `DiscoverResponse`. `sendMessage` now sends `recovery_context` when the previous assistant message was `no_results` / `soft_error`. Reads new fields from response, persists into store. New action `submitAction(intent: SuggestedActionIntent)`. |
| [client/src/components/DiscoverChat.tsx](../client/src/components/DiscoverChat.tsx) | Becomes a thin dispatcher. Maps `msg.role === 'user'` → `<UserMessage />`, otherwise → `<AssistantMessage />` (new). The big inline render currently at [lines 67-115](../client/src/components/DiscoverChat.tsx#L67-L115) is replaced. |
| **NEW** `client/src/components/discover/AssistantMessage.tsx` | Dispatcher. Reads `msg.kind`, picks one of the leaf components below. |
| **NEW** `client/src/components/discover/TextResponse.tsx` | Plain text bubble + optional ActionChipRow underneath. |
| **NEW** `client/src/components/discover/SearchResultsResponse.tsx` | Existing result-list rendering moved here (extracted from DiscoverChat). No new behavior in this package. |
| **NEW** `client/src/components/discover/NoResultsCard.tsx` | Calm card: applied-filters strip + reason copy + ActionChipRow. |
| **NEW** `client/src/components/discover/SoftErrorCard.tsx` | Amber tone (not red). Calm copy + ActionChipRow. |
| **NEW** `client/src/components/discover/ClarifyingQuestionCard.tsx` | Question text + 2-4 disambiguation chips. |
| **NEW** `client/src/components/discover/ActionChipRow.tsx` | Horizontal pill row. Tapping a chip dispatches its `intent` via `useDiscoverChat.submitAction(intent)`. |
| [client/src/components/DiscoverFilterChips.tsx](../client/src/components/DiscoverFilterChips.tsx) | None for v1. Stays read-only. (Interactive removal moves to Package B.) |
| [client/src/pages/DiscoverPage.tsx](../client/src/pages/DiscoverPage.tsx) | Pass an `onAction` handler down (currently only passes `onRetry`). Otherwise unchanged. |
| **NEW** `client/src/__tests__/discover.suggested-actions.test.ts` | Snapshot the deterministic action lists for each (kind × applied × role) combination. |
| **NEW** `client/src/__tests__/discover.recovery.test.ts` | Test recovery query detection regex against fixtures. |

Roughly 7 new component files, 4 modifications, 2 new test files, 2 new shared backend modules. About a week of focused work.

---

## Frontend rendering states

Per `kind`:

### `kind: 'text'`
- Bot avatar + white card + plain text.
- ActionChipRow underneath IF `suggested_actions.length > 0` (only happens for self-advice / greeting).

### `kind: 'results'`
- Bot avatar + white card + plain text (e.g. "I found 3 players for you.") + result list (existing component).
- No chips in v1.

### `kind: 'no_results'`
- Bot avatar + white card.
- Top line: `applied.role_summary` rendered as a small chip strip ("women's clubs", "U21 defenders in Spain").
- Calm explanation copy: "I searched for {role_summary}, but I didn't find a strong match yet."
- ActionChipRow with 4 chips below.

### `kind: 'soft_error'`
- Bot avatar + amber-50 card with subtle amber border (NOT red).
- Inline `AlertTriangle` icon (gray, not red).
- One-line: "I had trouble with that one — let's try a different angle."
- ActionChipRow with 4 chips: Retry / Broaden / Browse opportunities / Start over.

### `kind: 'clarifying_question'`
- Bot avatar + white card.
- Question text: "Are you looking for clubs, players, or coaches?"
- ActionChipRow built from `clarifying_options` (each option submits its `routed_query`).

### `kind: 'canned_redirect'`
- Bot avatar + white card with text. NO chips (the redirect copy itself contains the next action — visit /opportunities, etc.).
- This is the existing Phase 0 canned-redirect path; we're just tagging it.

### `kind: undefined` (back-compat)
- Renders as `kind: 'text'`. No chips. No regressions for cached messages from before the upgrade.

---

## Backend behavior changes

Per scenario, what the backend does:

### Search returns ≥1 result
- `kind: 'results'`
- `applied` populated from `enforcedRole` + `effectiveGender` + `baseLocationText` + `parsed.min_age/max_age`.
- `suggested_actions: []` (no chips on successful results in v1).

### Search returns 0 results
- `kind: 'no_results'`
- `applied` populated as above.
- `suggested_actions = getNoResultsActions(applied, userContext.role)` — 2-4 deterministic chips.
- `ai_message` rewritten to use `applied.role_summary`: "I searched for {role_summary} based on your profile, but I didn't find a strong match yet. Want to broaden it?" (replaces the current bare "I couldn't find any clubs matching that.")

### LLM call fails AND keyword fallback succeeds
- `kind: 'results'` (or `no_results` if total=0).
- `ai_message`: keep the existing "AI assistant is temporarily unavailable. Showing keyword matches instead." (or rewrite slightly: "AI is having a moment — here are keyword matches.")
- This path stays a normal results render; no soft-error block.

### LLM call fails AND keyword fallback fails (the screenshot's path)
- Today: 500 + harsh red block.
- After: **200** with `kind: 'soft_error'`. `ai_message: "I had trouble with that one — let's try a different angle."` `suggested_actions = getSoftErrorActions()`.
- The 500 path stays only for cases where we genuinely cannot return a meaningful response (e.g. unauthenticated, malformed body). Those are rare and pre-existing.

### Canned redirect (opportunities / products)
- `kind: 'canned_redirect'`. Existing behavior + tag.
- `suggested_actions: []`.

### Self-advice query (router entity_type = `self_advice`)
- `kind: 'text'`.
- `suggested_actions = getSelfAdviceActions(userContext.role)` — 3 role-aware chips.

### Greeting (router entity_type = `greeting`)
- `kind: 'text'`.
- `suggested_actions: [{ label: "What can you do?", intent: { type: 'free_text', query: "What can you help me with?" }}]` — single chip.

### Knowledge question (router entity_type = `knowledge`)
- `kind: 'text'`.
- `suggested_actions: []` — knowledge answers don't have a clear next action.

### Medium-confidence intent (router confidence = `medium`)
- **NEW behavior.** Today the router returns a hint and trusts the LLM. After Package A:
  - If `applied_entity` is unclear AND the message has a search-imperative verb → return `kind: 'clarifying_question'` with `clarifying_options` as the candidate entity types.
  - LLM is NOT called (saves a round-trip + cost). The clarifying question is deterministic.
- Trigger condition: `intent.confidence === 'medium'` AND query matches `HAS_SEARCH_IMPERATIVE`.

### Recovery mode
- **NEW.** When request body has `recovery_context.last_kind === 'no_results' | 'soft_error'` AND `detectRecoveryQuery(query)` returns true:
  - Backend short-circuits (no LLM call).
  - Returns `kind: 'no_results'` with the SAME `applied` as the previous turn + recovery-specific copy: "Since the {last_applied.role_summary} search didn't find anything, here are the next angles to try." + `getRecoveryActions(last_applied, userRole)` chips.
  - Cost: 0 tokens, ~50ms response.
- `detectRecoveryQuery` regex: matches "what should I do?", "so what now?", "and?", "ok?", "now what?", "what else?" — short follow-up shapes only.

---

## Recovery mode mechanics

The exact flow:

1. User asks "Find clubs for me" → backend returns `kind: 'no_results'` with `applied.entity = 'clubs'`, `applied.gender_label = 'Women'`.
2. Frontend stores the message with `kind` and `applied` in the Zustand chat store.
3. User asks "what should I do?" → frontend calls `sendMessage('what should I do?')`.
4. `sendMessage` looks at the most recent assistant message in the store. If its `kind` is `no_results` or `soft_error`, it includes `recovery_context: { last_kind: 'no_results', last_applied: {...} }` in the request body.
5. Backend receives the request. Checks: `recovery_context?.last_kind in ['no_results', 'soft_error']` AND `detectRecoveryQuery(query) === true`.
6. If both true → short-circuit. Build a deterministic response:
   - `kind: 'no_results'` (re-using the prior search context)
   - `applied = recovery_context.last_applied`
   - `ai_message = "Since the {applied.role_summary} search didn't find anything, here's where I'd look next:"`
   - `suggested_actions = getRecoveryActions(applied, userRole)` — usually the same set as the original no-results chips, but with a different leading chip (e.g. swap "Show all clubs" for "Try opportunities instead" since the user has now seen the no-results twice).
7. Return 200 in ~50ms. No LLM call.

If only one condition is true (recovery_context but query is not recovery-shaped, or query is recovery-shaped but recovery_context is missing) → fall through to normal LLM path. The recovery short-circuit is a special case, not a takeover.

---

## Suggested actions catalog (the deterministic source)

Living in `_shared/suggested-actions.ts`:

### `getNoResultsActions(applied, userRole)` — up to 4 chips

Generated as:

1. **Show all of the entity** — drops most filters. `{ label: "Show all clubs", query: "Show me all clubs" }`.
2. **Search by country** — when `applied.location_label` is unset. `{ label: "Search by country", query: "Find clubs in Spain" }` (Spain as a placeholder; Package B can let user pick).
3. **Remove the gender filter** — when `applied.gender_label` is set (most likely from UserContext seeding). `{ label: "Remove gender filter", query: "Find clubs without gender filter" }`.
4. **Cross-entity suggestion** — when `applied.entity === 'clubs'` and `userRole in ['player', 'coach']`. `{ label: "Find opportunities", query: "Find opportunities for my position" }`. For other entity/role combos, swap appropriately (a brand seeing no players → "Browse Marketplace").

Cap at 4. If <4 apply for the given case, ship with whatever's available — never pad with junk.

### `getSoftErrorActions()` — fixed 4 chips

```ts
[
  { label: "Retry",                intent: { type: 'retry' } },
  { label: "Broaden search",       intent: { type: 'free_text', query: "Find clubs near me" } },
  { label: "Browse opportunities", intent: { type: 'free_text', query: "Find opportunities for my position" } },
  { label: "Start over",           intent: { type: 'clear' } },
]
```

### `getSelfAdviceActions(userRole)` — 3 role-aware chips

Per role — see Quality Reset doc for the full set. Examples:

- **player**: `Find clubs for me` / `Find coaches` / `Improve my profile`
- **coach**: `Find clubs hiring` / `Find players to recommend` / `Improve my profile`
- **club**: `Find players for my team` / `Find coaches` / `What should I do next?`
- **brand**: `Find ambassadors` / `Browse Marketplace` / `Improve my brand profile`
- **umpire** / `unknown role`: empty chip set (no chips beats wrong chips).

### `getRecoveryActions(lastApplied, userRole)` — up to 4 chips

Same shape as `getNoResultsActions` but with one tweak: lead with a *different* angle than what was already attempted in the previous turn (the user has seen "broaden" already; offer a different first option). Implementation: rotate the chip order.

---

## Fallback behavior (back-compat)

The new fields are all **optional**. Three combinations to handle:

### Old client + new backend
- Backend emits `kind`, `applied`, `suggested_actions`. Old client ignores them, reads `ai_message` + `data` as before. No regression.

### New client + old backend (the rollout window)
- Backend doesn't send `kind`. Frontend reads `msg.kind ?? 'text'`. No `suggested_actions` → no chips render. No regression beyond the lack of new features.
- Specifically, the soft-error path on an old backend still returns 500 → frontend falls back to the existing `status: 'error'` rendering, which we leave as a small red inline notice during the rollout window. It can stay as a fallback for genuine hard errors after Package A ships.

### New client + new backend
- Full new behavior.

There's no flag-day cutover required. We can ship backend first, then frontend, with no user-visible breakage.

---

## QA scenarios (the acceptance bar)

Each one is a Playwright spec we add to `client/e2e/qa-quality-reset.spec.ts`. All gated on `QA_PROBE=1`.

1. **Player + no women's clubs (the screenshot's case).** Player E2E user signs in. Sends "Find clubs for me." Asserts: `<NoResultsCard />` renders. `applied.role_summary === "women's clubs"`. 4 chips: Show all clubs / Search by country / Remove gender filter / Find opportunities. NO red block visible.
2. **Recovery from no-results.** After scenario 1, user sends "what should I do?" Asserts: response in <500ms (no LLM call). `<NoResultsCard />` renders again with copy starting "Since the women's clubs search didn't find anything…". Same 4 chips with reordered first chip.
3. **Soft error.** Force the LLM call to fail (use a query that triggers timeout, or stub the env). Asserts: `<SoftErrorCard />` renders with amber tone, NOT red. 4 chips visible. NO 500 status code.
4. **Clarifying question.** Send a medium-confidence query like "find people for me." Asserts: `<ClarifyingQuestionCard />` renders. 3-4 disambiguation chips: Players / Coaches / Brands. Tapping one re-submits the routed_query as a new user message.
5. **Self-advice with chips.** Send "Who should I connect with?" as a player. Asserts: `<TextResponse />` renders. 3 role-aware chips: Find clubs for me / Find coaches / Improve my profile.
6. **Successful search (control).** Send "Find player ambassadors" as a brand. Asserts: `<SearchResultsResponse />` renders with results list. No chips in v1.
7. **Greeting.** Send "Hi". Asserts: `<TextResponse />` with 1 chip: "What can you do?"
8. **Knowledge question.** Send "What is a penalty corner?" Asserts: `<TextResponse />` with no chips.
9. **Action chip submits as new user message.** From scenario 1, tap "Show all clubs". Asserts: a new user message appears in the chat with content "Show me all clubs", followed by an assistant response.
10. **Retry chip resubmits the previous user query.** From scenario 3, tap "Retry". Asserts: new user message duplicates the previous user query (or is silently re-sent — implementation choice; either is fine if tested).
11. **Start over chip clears chat.** From scenario 3, tap "Start over". Asserts: chat is empty, default greeting/examples re-appear.
12. **Cross-account leakage check (regression).** Player A sends a no-results search → signs out → Player B signs in. Asserts: Player B's chat does NOT contain Player A's `applied` data.
13. **Old-shape persistence.** Restore a Zustand store snapshot from before Package A (no `kind` field on messages). Asserts: messages render as text bubbles (back-compat path), no chips, no errors.
14. **Telemetry shape.** After scenario 1, query `discovery_events`. Assert: row has `kind`, `applied`, `suggested_actions_count` populated. (We extend the `_meta` JSON to capture these.)

A passing run of all 14 = Package A ships.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Recovery regex over-fires** on legitimate non-recovery queries. | Tight regex (only matches short follow-ups: ≤6 words, no question content beyond "what/now/else/do"). Unit test with 30+ false-positive cases ("what is hockia?", "what should the AI do better?", "now find players"). |
| **Recovery short-circuit suppresses a real LLM-needed answer.** | Trigger requires BOTH `recovery_context.last_kind` AND the recovery regex match. If only one is true, fall through. Telemetry logs every recovery short-circuit so we can audit. |
| **Old-message persistence breaks the new dispatcher.** | All new fields are optional. `<AssistantMessage />` defaults `kind ?? 'text'`. Manual test: clear `localStorage.discover-chat`, send a message, hard-reload, check old persisted state still renders. |
| **Soft-error 200 confuses observability.** | The discovery_events row keeps `intent: 'error'` for the soft-error path so existing Sentry / dashboards still surface it. The HTTP 200 only changes user-visible UI; backend metrics keep the failure signal. |
| **Suggested actions become stale as the product evolves.** | Single source of truth in `_shared/suggested-actions.ts`. Adding a new role / entity → one place to update. Snapshot tests catch unintended drift. |
| **Frontend bundle size grows from 7 new components.** | Each component is small (~40-80 lines). Net add ≤8KB gzipped. Bundle budget at 99% — we'll verify with `Bundle size budget` CI step before merging. If we're over, lazy-load `<DiscoverChat>` (it's already a route-level component). |
| **Action chips trigger a flood of LLM calls.** | Most chips submit as new queries (one LLM call each, same as today's chat cost). `__retry__` re-submits the previous query — same volume. `__clear__` no LLM. Worst case: ~1.2× current LLM volume per session. |
| **Visual regression on existing happy-path searches.** | Snapshot test before/after on `<SearchResultsResponse />` (which is just the existing render extracted). The dispatcher dispatches based on `kind`, so unchanged kinds render unchanged UI. |
| **The "Start over" chip is destructive.** | Add a brief confirmation toast: "Chat cleared. Start a new conversation." Or: undo affordance. Defer the polish to Package B; v1 just clears. |

---

## Suggested PR breakdown

This package is best as 4 PRs against `staging`, each independently reviewable and shippable:

1. **PR-1: Backend response envelope (additive only).**
   Files: `nl-search/index.ts`, `_shared/suggested-actions.ts` (new), `_shared/recovery.ts` (new).
   Behavior: backend emits `kind`, `applied`, `suggested_actions` on every response. No frontend changes. Old frontend ignores the new fields. Zero user-visible impact.
   Tests: unit tests for suggested-actions + recovery-detection. SQL telemetry assertion: every recent row has new `_meta` keys.
   Ships: standalone. Validates the new shape on prod before any UI change.

2. **PR-2: Frontend dispatcher + leaf components.**
   Files: `useDiscover.ts` (type extensions, request-side recovery_context), `DiscoverChat.tsx` (replaced with dispatcher), 7 new components in `discover/`.
   Behavior: frontend reads new fields and renders the right component. Hard-error 500s still render the existing harsh red block as a fallback.
   Tests: Vitest + Playwright (the 14 QA scenarios above).
   Ships: after PR-1 is on prod.

3. **PR-3: Soft-error path + recovery short-circuit.**
   Files: `nl-search/index.ts` (soft-error 200, recovery handler), `_shared/recovery.ts` (regex).
   Behavior: transient failures return 200 + `kind: 'soft_error'`. Recovery-shaped follow-ups after no-results return deterministic recovery copy + chips, no LLM call.
   Tests: scenario 2 + 3 + 10 from the QA list.
   Ships: after PR-2 is on prod.

4. **PR-4: Clarifying question on medium-confidence + visual polish pass.**
   Files: `nl-search/index.ts` (clarifying_question emission), `<ClarifyingQuestionCard />`, design tokens for the new components.
   Behavior: medium-confidence intents return `kind: 'clarifying_question'` instead of trusting the LLM. New components get a polish pass against the live staging UI.
   Tests: scenario 4 + visual review.
   Ships: completes Package A.

After PR-4, Package A is done and Package B ("real envelope upgrade with all kinds first-class") can build on top without rework.

---

## Estimated complexity & timeline

- PR-1: 1.5 days (backend logic + unit tests).
- PR-2: 2.5 days (7 components + dispatcher + Playwright suite).
- PR-3: 1 day.
- PR-4: 1 day.

Total: ~6 working days of focused work, shippable as 4 PRs over 1-2 weeks depending on review cadence. No parallel-track work needed; each PR strictly depends on the prior one.

---

## Approval question

Confirm the PR breakdown and the QA scenarios match what you want. Once you approve, I'll start with PR-1 (backend response envelope, additive only — zero user-visible change) and ship it to staging for verification before any UI touches the chat surface.

Specific things worth a yes/no on:

1. PR sequence: backend-first (PR-1) → frontend-dispatch (PR-2) → soft-error+recovery (PR-3) → clarifying+polish (PR-4). OK?
2. The deterministic suggested-actions catalog (no LLM-generated chips in this package). OK?
3. Soft-error returns HTTP 200 (not 500). OK? — main concern is observability; we keep `intent: 'error'` in telemetry so dashboards/Sentry don't lose the failure signal.
4. Recovery short-circuit BYPASSES the LLM (no Gemini call) when triggered. OK? — saves ~5s and ~$0.0001 per recovery turn at the cost of less natural copy variation.
5. Visual polish lives in PR-4, not stretched across all four. OK?
