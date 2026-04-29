# Phase 4 — Scouting Shortlist v1 eval suite

A curated set of queries to (a) measure the current baseline before MVP-A/B
land, (b) compare Gemini 2.5 Flash vs Claude Sonnet 4.6 head-to-head, and
(c) verify Phase 4 delivers the user-visible improvements promised in the
product brief.

**Run schedule:**
1. **Baseline** — run all rows on Gemini *before* MVP-A/B code lands. Capture
   actual response, intent, result count, latency, tokens.
2. **Pre-MVP Sonnet** — same rows on Sonnet 4.6 with current code. Establishes
   provider-only delta (no feature changes).
3. **Post-MVP** — run all rows on both providers *after* MVP-A/B lands.
   Confirms feature improvements and re-measures provider delta.

## How to run

### A. Manual — staging UI

1. Open https://staging.inhockia.com/discover
2. Sign in as the user listed in the row's "Logged-in as" column
3. Type the query verbatim
4. Capture: AI message text, response kind, result count, any chips/cards rendered
5. Cross-reference with `discovery_events`:

```sql
SELECT created_at, llm_provider, intent, prompt_tokens, completion_tokens,
       cached_tokens, response_time_ms, fallback_used, error_message
FROM public.discovery_events
WHERE user_id = '<test-user-id>'
ORDER BY created_at DESC
LIMIT 10;
```

### B. Provider switching

To test Sonnet, set the staging secret:

```sh
supabase secrets set LLM_PROVIDER=claude --project-ref ivjkdaylalhsteyyclvl
```

To revert to Gemini default:

```sh
supabase secrets unset LLM_PROVIDER --project-ref ivjkdaylalhsteyyclvl
```

While `LLM_PROVIDER=claude` is set, **all** staging traffic routes through
Sonnet — minimize the window if other testers are active.

### C. Comparison summary template

For each row, fill in the per-provider columns. "Verdict" = does the response
match the "Expected" column? `pass` / `partial` / `fail` / `n/a (post-MVP only)`.

## Test rows

### Group A — Scouting intent (the core gap from the brief)

These are the queries the product owner explicitly called out as feeling
"dumb" today. After MVP-A/B they should return useful, role-aware results
with claimed-vs-unclaimed badges and per-row fit explanations.

| # | Query | Logged-in as | Currently expected (pre-MVP) | Post-MVP expected | Notes |
|---|---|---|---|---|---|
| A1 | "Find clubs in Spain" | Adult Women player | `no_results` or over-filtered (only claimed Spain women's clubs) | `results` with strong matches first (claimed + unclaimed badges); LLM does NOT auto-seed `target_category` for location-led club search | The brief's hero example. Currently broken — over-filters by playing_category. |
| A2 | "I want to play in Italy" | Female player | Soft over-filter; few or zero results | `results` mixing claimed Italian clubs + World directory clubs; explanation of which are claimed | Same shape as A1, different framing. |
| A3 | "Show me clubs in Belgium" | Coach | Some claimed clubs only | Strong shortlist with claimed + unclaimed; opportunity-aware ranking if MVP-A includes opportunity surfacing (currently held). | |
| A4 | "Find clubs worldwide" | Player | `no_results` or random subset | `results` with global mix; claimed-first ranking | New capability — currently no path queries World directory. |
| A5 | "Find me a goalkeeper available next season" | Club | `results` with Adult-Women-club gender filter (current Phase 3e behavior) | `shortlist` with top 3 explained: position, availability, references, video, profile completeness | MVP-A target — per-row fit_explanation rendered. |
| A6 | "Show me players with EU passport and references" | Club | `results` with hard filter on min_references=1 + eu_passport=true | `shortlist` with strong matches; missing-data flagged on weaker rows | |
| A7 | "Find a striker with experience in Belgium or the Netherlands" | Coach | Hard country filter; small result set | `shortlist` ranking by past-club country match; `missing_data` flagged when career_history missing | |
| A8 | "Find clubs where my profile fits" | Adult Women player | Auto-seeds adult_women, returns only claimed Adult Women clubs | `results` mixing claimed + unclaimed; `relaxed_filters` (post-MVP-C) explains what was loosened | |

### Group B — Role-aware behavior

One row per role. The umpire fix is bundled into MVP-A; the others measure
that the new shortlist shape doesn't regress current per-role logic.

| # | Query | Logged-in as | Currently expected | Post-MVP expected | Notes |
|---|---|---|---|---|---|
| B1 | "Find clubs in Germany that match my profile" | Adult Men player | Auto-seeds adult_men; results | Same; plus `fit_explanation` per row, claimed/unclaimed badges | |
| B2 | "Find clubs hiring head coaches" | Coach | `results`, opportunity-blocked (Phase-0 redirect) | Same (opportunities held for later phase) — no regression | |
| B3 | "Find female goalkeepers available next season" | Club | Hard filter on adult_women + position=goalkeeper + open_to_play | `shortlist` with top 3 explained | |
| B4 | "Find player ambassadors in Germany" | Brand | `results` with country filter; flat list | `shortlist`; `missing_data` flagged where consent/audience signals absent | Brand ambassador discovery is held out, but per-row reasoning should still apply to the player results. |
| B5 | "Find other officials in Australia" | Umpire | `results` with role=umpire, country filter; the SYSTEM_PROMPT line "umpires only when explicitly asked" prevents accidental cross-role surfacing | Same; plus umpire-tailored `fit_explanation` (level, format experience, references) | Bundled umpire role-guidance fix should improve self-advice + cross-role chips for umpires. |

### Group C — Current intelligence gaps (failure modes the brief named)

These rows verify the product owner's specific complaints reproduce today
and resolve after MVP-A/B.

| # | Query | Logged-in as | Currently expected | Post-MVP expected | Notes |
|---|---|---|---|---|---|
| C1 | "Find clubs in Spain" | Adult Women player (`Valentina` if available) | Over-filtered → `no_results` or just 1-2 claimed Adult Women clubs | `results` with mixed Spanish clubs (claimed + unclaimed); explicit "I don't know which are recruiting Adult Women but these are the clubs in Spain" message | Direct repro of the brief's bad-AI example. |
| C2 | "Find me clubs worldwide" | Any user | `no_results` (entity=clubs hits empty profiles WHERE country IS NULL) | `results` with large set, country-grouped rendering | |
| C3 | "Show me players with strong background" | Club | Maps "background" to nothing today (vague) | LLM extracts career_entries + references + video as "background" signals; ranks by composite | Tests whether Sonnet better understands the recruiting-domain word "background". |
| C4 | "Find midfielders with video and references" | Club | `results` with min_references=1 (hard); video not used as filter today | `shortlist`; video presence shown as `trust_signal` even though not a hard filter | Tests trust-signal rendering. |
| C5 | "Find clubs in Argentina" | Adult Women player | Currently a known weak spot (Argentina has lots of unclaimed World directory clubs but few claimed) | Strong results from World directory; "These clubs aren't claimed yet — external contact may be needed" | High-impact for Argentina-based users (the founder is in Argentina). |

### Group D — No-results recovery

Stress-test the chip catalog and recovery short-circuit. Same rows on both
providers; output shape should be identical (chips are deterministic).

| # | Query | Logged-in as | Expected response kind | Expected chips | Notes |
|---|---|---|---|---|---|
| D1 | "Find Adult Women clubs in nowhere-land" | Any | `no_results` | "Show all clubs", "Search by country", "Remove Adult Women filter", cross-entity chip | Tests `getNoResultsActions()`. |
| D2 | (Tap "Show all clubs" chip from D1) | Same | `results` (clubs) | empty `suggested_actions` (not no_results path) | Tests broaden flow. |
| D3 | "Find players" | Player | `clarifying_question` OR `results` with vague-default | If clarification: 3-4 routed_query options | Tests vague-query handling. |
| D4 | "Find Adult Men strikers in Antarctica with EU passport and 5+ references" | Any | `no_results` | Chips include some relaxation hint | Pre-MVP-C: chip-only. Post-MVP-C: backend auto-relaxes one filter and surfaces `relaxed_filters`. |

### Group E — Hockey knowledge (parity check, not a feature)

Verifies the third tool path (`answer_hockey_question`) still works on both
providers. Should be identical-shape responses, different prose quality.

| # | Query | Expected response kind | Notes |
|---|---|---|---|
| E1 | "What does a defender do in field hockey?" | `text` (knowledge) | Multi-paragraph answer about defenders. |
| E2 | "Rules of a penalty corner" | `text` (knowledge) | Numbered list of rules. |
| E3 | "Difference between indoor and outdoor hockey" | `text` (knowledge) | Comparative answer. |

### Group F — Self-advice + greetings (parity check)

Already validated for Claude in the smoke test (Group F1). Repeat under
formal eval to compare prose quality.

| # | Query | Logged-in as | Expected response kind | Notes |
|---|---|---|---|---|
| F1 | "Hello" | Any | `text` (conversation) | Personalized greeting using full_name from UserContext. |
| F2 | "What should I improve in my profile?" | Player at <100% | `text` (conversation) | Lists items from MISSING PROFILE FIELDS only (no invention). |
| F3 | "Who am I?" | Any | `text` (conversation) | Summary of UserContext in 2-3 sentences. |
| F4 | "What can I do next on HOCKIA?" | Coach | `text` (conversation) | Role-aware suggestions per ROLE GUIDANCE block. |

### Group G — Multi-filter combos

Stress-test filter extraction accuracy.

| # | Query | Expected `parsed_filters` | Notes |
|---|---|---|---|
| G1 | "Find Adult Women defenders in Argentina" | `target_category=adult_women`, `positions=['defender']`, `nationalities OR locations=['Argentina']` | |
| G2 | "Girls U18 goalkeepers in Spain" | `target_category=girls`, `max_age=17`, `positions=['goalkeeper']`, `locations=['Spain']` | |
| G3 | "Mixed coaches with verified references in the Netherlands" | `target_category=mixed`, `roles=['coach']`, `min_references>=1`, `locations=['Netherlands']` | |
| G4 | "EU passport midfielders open to Germany" | `eu_passport=true`, `positions=['midfielder']`, `availability='open_to_play'`, `countries=['Germany']` | The brief's hero combo example. |

## Comparison metrics

For each row, capture:

| Metric | How to measure |
|---|---|
| **Intent correctness** | Did `intent` match the expected category? (search / conversation / knowledge / clarifying / no_results) |
| **Filter extraction accuracy** | Compare actual `parsed_filters` to expected. Score per-filter: extracted-correctly vs missed vs hallucinated |
| **Result count** | Number of profile cards returned (or 0 for no_results) |
| **Result count delta vs Gemini** | Sonnet result count − Gemini result count |
| **p50 / p95 latency** | `response_time_ms` from discovery_events; aggregate across the whole suite |
| **Token cost** | `prompt_tokens + completion_tokens` per call. With cached_tokens factored in: paid_input = prompt - cached |
| **Cache hit rate (Sonnet)** | `cached_tokens / prompt_tokens` ratio. Cache TTL is 5 min — running rows in quick succession should show hits after row 1 |
| **Quality verdict (subjective)** | `pass / partial / fail` against the "Expected" column |

## Decision gate (after Phase 4 ships)

Promote Sonnet → primary on prod IF all of:
1. Sonnet quality verdict ≥ Gemini on ≥80% of rows in groups A, B, C
2. Sonnet p95 latency ≤ 2× Gemini p95
3. Sonnet token cost (with cache) ≤ 4× Gemini cost
4. No regressions in groups D, E, F (deterministic / parity rows)

Otherwise: keep Gemini primary, use Sonnet as rate-limit fallback only.

## Known-broken rows (will improve with phase work)

The following rows are EXPECTED to fail or partial-pass at baseline. Document
the actual behavior so Phase 4 improvement can be measured against it.

- A1, A2, A4, A5, A6, A7, A8 — currently rigid filter behavior, no shortlist shape, no per-row reasoning
- A4, C2, C5 — World directory queries return 0 (no LLM tool surface)
- C1 — over-filtering by playing_category for location-led club search
- D4 — no auto-relaxation; user must tap chip

These are the bar Phase 4 has to clear.
