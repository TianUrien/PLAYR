# PLAYR — Launch Readiness for 1,000 Users (Go/No‑Go)

Date: 2025-12-11

This is a practical, testable checklist to answer: “Are we ready for 1,000 real users?”

## 1) Product Quality (User-Facing)

**Go criteria (must-have)**
- Mobile navigation is reliable across all dashboard pages (menu visible, tappable; no clipped dropdowns).
- Role/label correctness across profile surfaces (no misleading pills like wrong “Open to …” copy).
- Dates/timestamps are consistently formatted and correct (no future dates, negative ages, wrong ordering).
- Critical flows are stable:
  - Sign up → complete profile → land on correct dashboard
  - Player: browse opportunities → view details → apply
  - Club: view vacancy applicants
  - Messaging: send/receive, unread state, and conversation list correctness

**Signals we should not ignore**
- “Works on desktop, breaks on iOS” regressions.
- Copy/label mistakes (trust/correctness issues) on the primary profile screen.
- Any UI state that opens but is invisible (clipping/z-index/overflow).

## 2) Reliability & Error Handling

**Go criteria (must-have)**
- Centralized error monitoring (e.g., Sentry) with alerts for:
  - auth failures
  - API errors spikes
  - client crashes / unhandled rejections
- A clear fallback UI for failures (network down, Supabase hiccup, RPC errors).
- No console errors on core routes in typical use.

## 3) Performance

**Go criteria (must-have)**
- Baseline measurements recorded for:
  - landing / dashboard initial render
  - opportunities list load and filter interactions
  - messaging view load
- Confirm mobile performance is acceptable (no long main-thread blocks; acceptable scroll).

## 4) Security & Abuse Readiness

**Go criteria (must-have)**
- Rate limits or abuse controls for sign-in/sign-up and messaging endpoints.
- No sensitive tokens persisted or exposed in client logs.
- RLS policies validated for user data access boundaries.

## 5) Operations

**Go criteria (must-have)**
- Support playbook for common issues (login problems, profile stuck incomplete, missing data).
- Canary rollout plan (start with 50–100 users, then 1,000).
- Post-launch monitoring dashboard and on-call ownership.

## 6) Automated Evidence (What we should have in CI)

**Minimum E2E suite**
- Public smoke:
  - `/` landing loads
  - `/signup` role selection loads
  - `/opportunities` loads + unauth apply shows sign-in prompt
- Player smoke:
  - `/dashboard/profile` loads
  - dashboard menu is visible on mobile viewport
  - opportunities seeded vacancy flow works
- Club smoke:
  - applicants page for seeded vacancy loads
- Messaging smoke (next):
  - open conversation + send + verify received

## Recommendation

As of this date, **No-Go** until the “Product Quality” and “Automated Evidence” items are green and we have monitoring in place. The fastest path is:
1) lock mobile dashboard stability + labels + dates
2) add smoke E2E coverage for dashboard + messaging
3) roll out to 50–100 users for 1–2 weeks
