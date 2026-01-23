# PLAYR Environment Setup Guide

This document describes the multi-environment setup for PLAYR's Supabase backend.

## Environment Overview

| Environment | Supabase Project | Vercel Target | Domain | Purpose |
|-------------|------------------|---------------|--------|---------|
| **Local** | `supabase start` | N/A | `localhost:5173` | Daily development |
| **Staging** | `ivjkdaylalhsteyyclvl` | Preview | `playr-staging.vercel.app` | E2E tests, pre-prod validation |
| **Production** | `xtertgftujnebubxgqit` | Production | `oplayr.com` | Real users |

## Supabase Project Details

### Production
- **Project ref:** `xtertgftujnebubxgqit`
- **URL:** `https://xtertgftujnebubxgqit.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/xtertgftujnebubxgqit

### Staging
- **Project ref:** `ivjkdaylalhsteyyclvl`
- **URL:** `https://ivjkdaylalhsteyyclvl.supabase.co`
- **Dashboard:** https://supabase.com/dashboard/project/ivjkdaylalhsteyyclvl

## Local Development Setup

### Option A: Local Supabase (Recommended)

```bash
# Start local Supabase (requires Docker)
cd /path/to/PLAYR
supabase start

# This outputs local credentials - copy them to .env.local
```

Create `client/.env.local`:
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<from supabase start output>
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<from supabase start output>
VITE_ENVIRONMENT=development
```

### Option B: Use Staging Backend

Create `client/.env.local`:
```bash
SUPABASE_URL=https://ivjkdaylalhsteyyclvl.supabase.co
SUPABASE_ANON_KEY=<staging-anon-key>
VITE_SUPABASE_URL=https://ivjkdaylalhsteyyclvl.supabase.co
VITE_SUPABASE_ANON_KEY=<staging-anon-key>
VITE_ENVIRONMENT=staging
```

## Vercel Environment Variables

### Production (Environment: Production)

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://xtertgftujnebubxgqit.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<production-anon-key>` |
| `VITE_ENVIRONMENT` | `production` |
| `VITE_SENTRY_DSN` | `<sentry-dsn>` |

### Preview (Environment: Preview)

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | `https://ivjkdaylalhsteyyclvl.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<staging-anon-key>` |
| `VITE_ENVIRONMENT` | `staging` |
| `VITE_SENTRY_DSN` | `<sentry-dsn>` (optional) |

## GitHub Actions Secrets

For CI/CD to run E2E tests against staging:

| Secret | Description |
|--------|-------------|
| `STAGING_SUPABASE_URL` | `https://ivjkdaylalhsteyyclvl.supabase.co` |
| `STAGING_SUPABASE_ANON_KEY` | Staging anon key |
| `E2E_PLAYER_EMAIL` | `playrplayer93@gmail.com` |
| `E2E_PLAYER_PASSWORD` | Password for player test account |
| `E2E_CLUB_EMAIL` | `clubplayr8@gmail.com` |
| `E2E_CLUB_PASSWORD` | Password for club test account |
| `E2E_COACH_EMAIL` | `coachplayr@gmail.com` |
| `E2E_COACH_PASSWORD` | Password for coach test account |

## Database Migration Workflow

### Developing a new migration

```bash
# 1. Ensure you're linked to production (for schema reference)
supabase link --project-ref xtertgftujnebubxgqit

# 2. Create your migration file
touch supabase/migrations/YYYYMMDDHHMM_description.sql

# 3. Test locally first
supabase db reset  # Applies all migrations to local DB

# 4. Push to staging for validation
supabase unlink
supabase link --project-ref ivjkdaylalhsteyyclvl
supabase db push

# 5. After staging validation, push to production
supabase unlink
supabase link --project-ref xtertgftujnebubxgqit
supabase db push
```

### Quick switch commands

```bash
# Switch to staging
supabase unlink && supabase link --project-ref ivjkdaylalhsteyyclvl

# Switch to production
supabase unlink && supabase link --project-ref xtertgftujnebubxgqit

# Check current link
cat supabase/.temp/project-ref
```

## Edge Function Deployment

```bash
# Deploy to staging
supabase link --project-ref ivjkdaylalhsteyyclvl
supabase functions deploy

# Deploy to production
supabase link --project-ref xtertgftujnebubxgqit
supabase functions deploy
```

### Edge Function Secrets

Both environments need these secrets (set via Dashboard or CLI):

| Secret | Required | Notes |
|--------|----------|-------|
| `RESEND_API_KEY` | Yes | Email sending |
| `TEST_NOTIFICATION_RECIPIENTS` | Optional | For `notify-test-vacancy` |
| `BLOCKED_NOTIFICATION_RECIPIENTS` | Optional | For `notify-vacancy` |

Auto-injected by Supabase (don't set manually):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

## E2E Test Accounts

These accounts must exist in **STAGING** database:

| Email | Role | Password |
|-------|------|----------|
| `playrplayer93@gmail.com` | player | (set in env) |
| `clubplayr8@gmail.com` | club | (set in env) |
| `coachplayr@gmail.com` | coach | (set in env) |

To create them, sign up manually on `https://playr-staging.vercel.app` or run:
```bash
supabase link --project-ref ivjkdaylalhsteyyclvl
psql <staging-connection-string> -f client/e2e/setup-e2e-accounts.sql
```

## Pre-Deployment Checklist

Before pushing to **PRODUCTION**:

- [ ] Migration tested on staging (`supabase db push` to staging)
- [ ] E2E tests pass against staging
- [ ] No console errors in staging preview deployment
- [ ] Edge functions deployed to staging and tested
- [ ] Linked to correct project (`cat supabase/.temp/project-ref`)
- [ ] Database backup recent (check Supabase Dashboard)

## Troubleshooting

### "Wrong environment" errors

Check which project you're linked to:
```bash
cat supabase/.temp/project-ref
```

### E2E tests failing with auth errors

1. Verify test accounts exist in staging
2. Check `E2E_ALLOWED_SUPABASE_URL` matches staging URL
3. Ensure `E2E_ALLOW_WRITES=1` is set

### Migration conflicts

If staging and production have diverged:
```bash
# Check migration status
supabase db diff --linked
```

## Quick Reference

| Task | Command |
|------|---------|
| Start local Supabase | `supabase start` |
| Stop local Supabase | `supabase stop` |
| Reset local database | `supabase db reset` |
| Link to staging | `supabase link --project-ref ivjkdaylalhsteyyclvl` |
| Link to production | `supabase link --project-ref xtertgftujnebubxgqit` |
| Push migrations | `supabase db push` |
| Deploy functions | `supabase functions deploy` |
| View function logs | `supabase functions logs <function-name>` |
| List secrets | `supabase secrets list` |
| Set secret | `supabase secrets set KEY=value` |
