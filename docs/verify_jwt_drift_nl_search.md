# `verify_jwt` config drift — `nl-search` edge function

**Status:** documented, NOT changed. Investigation deferred.
**Captured:** 2026-04-28, during Phase 0 production promotion.

## Current state

| Environment | Project ref | `verify_jwt` |
|---|---|---|
| Staging | `ivjkdaylalhsteyyclvl` | **`true`** |
| Production | `xtertgftujnebubxgqit` | **`false`** |

Both projects run the same Phase 0 source code (matching `ezbr_sha256: 29840d9a251289c3e5b3f16f4f3e23ea3f0ae4e689a9ae23539bf275dfe09cd5` after the 2026-04-28 prod deploy). The drift is purely in the function-config layer, not the bundle.

The 2026-04-28 prod deploy preserved `verify_jwt: false` per explicit instruction — production auth behavior was not changed during the Phase 0 rollout.

## What `verify_jwt` does

When `true`, Supabase's edge runtime validates the `Authorization: Bearer <jwt>` header against the project's JWT secret BEFORE the function body runs. Invalid / missing / expired JWTs are rejected at the runtime layer with a 401, never reaching the function.

When `false`, the runtime accepts the request regardless of auth header. The function is responsible for its own auth check.

## Why the drift may be safe today

`nl-search/index.ts` performs an explicit auth check in the function body (lines ~234–249):

```ts
const authHeader = req.headers.get('authorization')
if (!authHeader?.startsWith('Bearer ')) return 401
const { data: { user }, error: authError } = await userClient.auth.getUser(token)
if (authError || !user) return 401
```

This means even with `verify_jwt: false` on prod, an unauthenticated request still 401s — the runtime doesn't gate it, the function does. The behavior should be functionally equivalent to staging's `verify_jwt: true` for the happy path.

## Potential risks

Listed in rough order of likelihood × impact:

1. **Defense-in-depth weakening.** Two layers of auth (runtime + function) is strictly safer than one. With `verify_jwt: false`, a regression in the function's `getUser(token)` call path (e.g. an early `return` accidentally placed before the auth check) silently lets unauthenticated traffic in. Staging's `verify_jwt: true` would have caught that at the runtime layer; prod won't.

2. **CORS preflight handling.** With `verify_jwt: true`, the runtime returns a 401 on missing/invalid auth even for preflight (`OPTIONS`) — but the function handles `OPTIONS` first explicitly, so this is benign for `nl-search`.

3. **Rate-limit attack surface.** Anonymous requests can hit the function (which then 401s in user code) consuming function invocations. With `verify_jwt: true`, those would be rejected before invocation — slightly cheaper. Function invocation cost on the Free / Pro tier is ~free, but Edge function CPU time is metered on Team tier.

4. **Service-role token semantics differ.** `verify_jwt: true` rejects requests with the service-role key in the Authorization header (it's not a user JWT), unless the function path is whitelisted. Tests / scripts that hit the function with the service-role key for ops tasks would behave differently between envs. `nl-search` is not currently called this way, but worth knowing.

5. **Drift is invisible on a casual inspection of the source.** A new contributor reading `supabase/config.toml` or the function source won't see this difference — it's only visible in the dashboard or via `list_edge_functions`. This is the highest-impact risk: someone copies the prod-style call from a notebook to staging and gets a 401 they don't expect, or vice versa.

## How the drift likely arose

Best guess from the evidence: prod was deployed via the Supabase dashboard with the "Verify JWT" toggle off (or via a CLI deploy with `--no-verify-jwt` at some past date) when the function was first created on prod. Staging was created later via a different mechanism that defaulted to `true`. There's no source-of-truth in the repo (`config.toml` doesn't pin per-function `verify_jwt`), so each env's setting just sticks until someone changes it.

## Recommended future investigation

When the user is ready to align this:

1. **Decide direction.** Defaulting to `true` (the safer setting) is the right answer if and only if every existing prod caller of `nl-search` passes a real user JWT (not service role, not no-auth). Quick audit:
   - Frontend `client/src/hooks/useNlSearch.ts` (or equivalent) — does it pass `session.access_token`? Yes, per code reading.
   - Any cron / scheduled job calling `nl-search`? Currently no.
   - Any internal RPC calling `nl-search`? No — it's only called from the client.
   So flipping to `true` should be safe, but verify in staging first.

2. **Pin the setting in source.** Add a `[functions.nl-search] verify_jwt = true` block to `supabase/config.toml` so future CLI deploys to either env enforce the same setting. Today the CLI deploy has to pass `--no-verify-jwt` explicitly to preserve prod's setting — that's a foot-gun.

3. **Cutover process.**
   - Staging: already at `true`, no change.
   - Production: flip via dashboard during low-traffic window; monitor `discovery_events.error_message` for any 401-shaped errors over the next ~24h.
   - Roll back path: re-deploy with `--no-verify-jwt` if a regression appears.

4. **Audit other functions for the same drift.** From the `list_edge_functions` output during the Phase 0 deploy:
   - Both envs match for: `delete-account` (true), `notify-*` (true), `send-push` (true), `notify-message-digest` (true).
   - Both at `false`: `admin-actions`, `public-opportunities`, `health`, `resend-webhook`, `admin-send-campaign`, `admin-send-test-email`.
   - **Only `nl-search` shows the prod=false / staging=true mismatch.** So this is an isolated drift, not a systemic config-management problem.

## What to do now

Nothing. This note exists so the drift is captured and not forgotten. Phase 0 is in production with the existing setting preserved; the function-body auth check is the active defense. Revisit when there's appetite for a small infra cleanup PR — likely paired with `config.toml` pinning so the setting is reproducible from source.
