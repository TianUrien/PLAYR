# Smoke Test Summary – November 13, 2025

1. **Type Generation**
   - Regenerated Supabase database types via `supabase gen types typescript --linked --schema public`.
   - Confirmed `client/src/lib/database.types.ts` now matches the freshly applied schema (profiles, messaging, vacancies, gallery, storage tables).

2. **Environment Verification**
   - Updated `client/.env.example` with `SUPABASE_URL` / `SUPABASE_ANON_KEY` placeholders tied to project `xtertgftujnebubxgqit` plus Vite aliases for convenience.
   - Verified `.env.local` already points to the same project.

3. **Automated Smoke Checks**
   - `npm run build:check` (TypeScript project references + Vite production bundle) ✅
     - Added missing `tslib` runtime helper dependency and explicit Vite alias to unblock Rolldown bundling.
   - `npm run lint` ✅

4. **Manual Follow‑Up (pending if desired)**
   - Launch local dev server (`npm run dev`) and walkthrough:
     - Email signup + profile completion (player/coach/club) – ensure new schema still persists correctly.
     - Vacancy creation + application flow (club ↔ player).
     - Messaging flow (send/read, unread counts).
   - Spot-check Supabase dashboard tables for newly created records and bucket uploads.

_No new issues surfaced during automated checks. Manual app flows are recommended next if time permits._
