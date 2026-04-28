# HOCKIA AI — Phase 1 Proposal

**Status:** DRAFT — not yet approved for implementation.
**Author:** prepared 2026-04-28, after Phase 0 promotion to production.
**Predecessor:** Phase 0 (deterministic entity routing + UserContext + canned redirects + telemetry) is live in production. The "asked for clubs, got mixed players/coaches/brands" bug is structurally fixed.

This doc proposes the scope, sequencing, and risks of the next iteration. It is intentionally short — implementation details are deferred until each item is approved.

---

## Phase 1 goals

The Phase 0 surface is correct but feels static. Replies arrive as a single blob ~5–10s after typing; opportunities and products redirect to other pages instead of being searchable; results are rendered as plain text rather than typed cards; the AI does not propose follow-ups or clarifying questions. Phase 1 turns the AI from a "single-turn search box" into an interactive assistant that can:

- Stream responses so the user sees the AI is "thinking"
- Search opportunities and products natively, not redirect away
- Render results as typed cards (clubs, players, coaches, opportunities, products) the user can act on inline
- Offer follow-up chips and clarifying questions when the query is ambiguous

The acceptance bar is "feels like ChatGPT, but for HOCKIA discovery."

---

## Proposed scope (9 items)

### 1. Streaming responses

Render the AI's text response token-by-token instead of waiting for the full response. The current Gemini call is already a fetch — switching to the streaming endpoint (`streamGenerateContent`) and writing chunks to a `ReadableStream` is the smallest meaningful UX upgrade. Drops perceived latency from "5–10s of nothing" to "first token in ~1s."

- **Complexity:** Medium. Requires a streaming-capable response in the edge function (Server-Sent Events or a fetch-stream), client-side stream consumption in `DiscoverPage`, and graceful fallback for non-streaming paths (canned redirects, errors).
- **Risk:** Edge runtime stream lifecycle quirks (Deno's `ReadableStream` cancellation semantics under EdgeRuntime); tool-call chunks need to be reassembled before parsing — only the message body should be streamed.
- **Sequencing:** First. Everything else assumes a streaming primitive in place.

### 2. Status messages in the AI chat

While the LLM is working (and especially during the slow path: LLM call + RPC + qualitative synthesis), show inline status lines: "Searching clubs…", "Filtering by your gender…", "Reading reputation signals…". Implemented as small text events emitted from the edge function alongside the streamed response.

- **Complexity:** Low. Once streaming is in place, this is just emitting tagged events from the function at the right phase boundaries.
- **Risk:** Status text reads as "performance theater" if it's not honest. Each status string must correspond to actual backend work in flight.
- **Sequencing:** Bundled with #1 — they share the streaming transport.

### 3. Real opportunity search

Replace the canned `/opportunities` redirect with an actual filtered search. Backend: extend `nl-search` with an opportunity branch that calls `discover_opportunities` (or a new RPC). Filters at minimum: country, league, gender, role-type (player/coach), open vacancies only. Frontend renders results as opportunity cards.

- **Complexity:** Medium-high. Requires a new RPC (or reuse of `discover_opportunities` if it exists), opportunity-aware filters in the LLM tool schema, and a typed result card.
- **Risk:** Opportunity filter semantics are looser than profile filters — "U21 trials in Spain" maps to multiple fields (`age_eligibility`, `country`, `vacancy_type`). The LLM will need explicit tool-schema guidance.
- **Sequencing:** After cards (#5) — opportunity cards are the first non-profile entity-type the UI must render.

### 4. Real product / Marketplace search

Replace the `/marketplace` canned redirect with a product search that calls `brand_products` (or a wrapper RPC). Filters: category, brand, price band, in-stock. Frontend renders product cards with a Marketplace-style layout (image, brand, name, price).

- **Complexity:** Medium. The product schema is simpler than opportunities, but the visual surface (product cards) is the largest delta from the current text-only chat.
- **Risk:** Marketplace data scarcity on staging. Product searches will return 0 results most of the time until brands actually post products. The "no-results" path needs to be informative ("Marketplace currently has 12 products across 3 brands; try …") rather than just empty.
- **Sequencing:** After #3, sharing the typed-card infrastructure from #5.

### 5. Typed result cards

Today every result is rendered as a generic profile-tile in `<DiscoverPage />`. Phase 1 needs distinct components: `<PlayerCard />`, `<ClubCard />`, `<CoachCard />`, `<BrandCard />`, `<OpportunityCard />`, `<ProductCard />`. Each card surfaces 3–5 high-signal fields and a primary action ("View profile", "Apply", "Buy", etc.).

- **Complexity:** Medium. The data shape is already on the backend — this is mostly frontend component work + a discriminated-union response type from `nl-search` (`type: "search.players" | "search.opportunities" | …`).
- **Risk:** Drift between the AI summary text and what's on the cards (e.g., AI says "I found 3 players in England" but card shows a Dutch player). Backend should enforce that AI message + card list are derived from the same RPC result set.
- **Sequencing:** Foundational. Implement before #3 and #4 (they need the card scaffolding) but after #1 (streaming primitive sets the response shape).

### 6. Suggested follow-up chips

After every assistant message, render 2–3 clickable chips with concrete next-query suggestions ("Show only U21", "Filter to Spain", "Find their coaches"). Two implementation paths:

- **LLM-generated** — ask the LLM for follow-ups in the same turn. Costs a few extra tokens per response. Easier to ship; quality varies.
- **Heuristic** — derive from the query + result context (e.g., "you searched players + got 3 → suggest narrowing by position"). More predictable; less natural.

Recommend starting LLM-generated and watching telemetry; switch to heuristic if quality is low.

- **Complexity:** Low-medium for LLM path; medium for heuristic. Frontend is just a chip row that re-submits as a user message.
- **Risk:** Chip suggestions that are clearly wrong erode trust quickly. Need a quality bar (maybe 80%+ acceptance from internal testing) before rollout.
- **Sequencing:** After cards (#5) — chips are tied to result types.

### 7. Clarifying-question UX

When the keyword router lands `medium` confidence (currently telemetry-only), the AI should ASK rather than guess: "Are you looking for clubs, players, or opportunities?" with 3 chips. Today these queries fall through to the all-4-roles fallback (`filter_source: fallback` in telemetry) — Phase 0 left this in place specifically so Phase 1 could replace it with a clarifying-question path.

- **Complexity:** Low. Reuses the chip infrastructure from #6 + the medium-confidence branch already exists in the router.
- **Risk:** Over-asking. The AI should clarify only when confidence is genuinely medium AND the result set would otherwise be mixed. Setting the threshold tight matters.
- **Sequencing:** After #6 (depends on chip rendering).

### 8. Sonnet experiment — when and how

Today the LLM is Gemini 2.5 Flash, swappable via `LLM_PROVIDER`. Sonnet 4.6 would be ~10× more expensive per call but materially smarter at: ambiguity detection, multi-entity reasoning, chip generation, clarifying-question phrasing.

Recommend testing Sonnet **after** items #1–#7 are stable, not during. Reasons:

- Many of these items make the AI's response shape more complex (typed cards, chip arrays, status messages). Testing two variables at once (provider + product surface) makes regressions hard to attribute.
- Phase 0 telemetry already gives us a baseline (`prompt_version`, `router_*`, `enforced_role`, response_time_ms). Once Phase 1 is shipped on Gemini and that baseline shifts, we can A/B Sonnet against the new shape with a simple `LLM_PROVIDER` flip per request, gated on a user-flag or a percentage rollout.
- Cost gating: Sonnet at full traffic without a free tier is ~$X/mo at current Phase 0 volume — we should pencil this out before flipping the env var.

The experiment should ship with: telemetry comparison view (response time, chip-acceptance rate, mixed-result rate, qualitative satisfaction), clear rollback flag, and a hard cost cap. Do NOT rollout to 100% before the comparison shows a defensible delta.

### 9. Sequencing, complexity, risks at a glance

| # | Item | Complexity | Risk | Order |
|---|---|---|---|---|
| 1 | Streaming responses | Medium | Edge runtime stream lifecycle | 1 |
| 2 | Status messages | Low | "performance theater" if dishonest | 1 (bundled) |
| 5 | Typed result cards | Medium | AI/card drift | 2 |
| 3 | Real opportunity search | Medium-high | Filter semantics | 3 |
| 4 | Real product search | Medium | Marketplace data scarcity | 4 |
| 6 | Follow-up chips | Low-medium | Wrong chips erode trust | 5 |
| 7 | Clarifying-question UX | Low | Over-asking | 6 |
| 8 | Sonnet experiment | Medium | Cost + attribution noise | 7 |

**Recommended cuts** if scope needs to shrink: defer #6 + #7 to Phase 1.5. Items #1–#5 are the meaningful UX delta from Phase 0; chips and clarifying questions are quality-of-life polish.

---

## What this proposal does NOT include

Out of scope for Phase 1, intentionally:

- Multi-turn memory beyond the current 10-turn history — the conversation context already works for now.
- Voice input / output.
- AI-driven profile editing or settings changes — only read-side surfaces.
- LLM fine-tuning on HOCKIA data — premature without volume.
- Self-hosted models — operationally premature.

---

## Open questions for approval

1. Approve scope #1–#7 for implementation, or trim to #1–#5?
2. Confirm Sonnet experiment is post-Phase-1 (#8 last), not bundled in.
3. Set a cost cap for the Sonnet experiment before flipping the flag.
4. Any non-listed item (e.g. a specific real-user query that's currently broken) we should prioritize?

Once these are answered, each item gets a focused implementation PR rather than a single bundled rollout.
