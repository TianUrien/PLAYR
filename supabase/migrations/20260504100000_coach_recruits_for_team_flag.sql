-- =========================================================================
-- profiles.coach_recruits_for_team — coach dual-mode flag (v5 plan, Phase 1A.4)
-- =========================================================================
-- Coaches on HOCKIA are dual-sided: many are job-seekers (candidate mode)
-- AND recruiters for their own teams (recruiter mode). Today the dashboard
-- treats every coach as a candidate; recruiter affordances exist only
-- buried in the AI Discovery example queries. This flag opts the coach
-- into the recruiter UX:
--
--   - CoachDashboard Quick Actions splits into two cards (Build profile +
--     Recruit your team) when true
--   - DiscoverPage example queries surface the recruiter-shaped queries
--     ("Players I could recommend for my staff") first
--
-- Defaults to false so the change is opt-in. Settable on coach onboarding
-- step 3 ("Do you also recruit for a team?") or via Settings later. No
-- effect on non-coach roles — the flag is meaningful only when role='coach',
-- but we don't gate at the schema level (keeps the column simple to query
-- and lets a later role-change still preserve the value).
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS coach_recruits_for_team BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.coach_recruits_for_team IS
  'When true and role=coach, surfaces recruiter-mode UX (dashboard recruit card, recruiter-first AI Discovery examples). Opt-in via onboarding or Settings. Meaningful only for role=coach but not constrained at the column level.';
