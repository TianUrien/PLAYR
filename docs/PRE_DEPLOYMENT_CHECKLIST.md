# PLAYR Pre-Deployment Checklist

Use this checklist before deploying database migrations or edge functions to **PRODUCTION**.

## Before Database Migration (`supabase db push`)

### 1. Verify Target Environment
```bash
# Must show: xtertgftujnebubxgqit (production)
cat supabase/.temp/project-ref
```
- [ ] Confirmed linked to correct project

### 2. Test on Staging First
```bash
# Switch to staging
supabase unlink && supabase link --project-ref ivjkdaylalhsteyyclvl

# Push to staging
supabase db push

# Verify no errors in staging dashboard
```
- [ ] Migration applied successfully to staging
- [ ] No RLS policy errors
- [ ] Application works on `playr-staging.vercel.app`

### 3. Review Migration Content
- [ ] No `DROP TABLE` without explicit confirmation
- [ ] No `DELETE FROM` without `WHERE` clause
- [ ] No `TRUNCATE` statements
- [ ] `ALTER TABLE` has safe defaults for existing rows
- [ ] New RLS policies tested manually

### 4. Backup Awareness
- [ ] Know when last backup was taken (Supabase Dashboard → Database → Backups)
- [ ] For critical changes: request manual backup first

### 5. Execute Production Migration
```bash
# Switch to production
supabase unlink && supabase link --project-ref xtertgftujnebubxgqit

# Preview what will change
supabase db push --dry-run

# Apply migration
supabase db push
```
- [ ] `--dry-run` output reviewed
- [ ] Migration applied successfully

---

## Before Edge Function Deployment

### 1. Verify Target Environment
```bash
cat supabase/.temp/project-ref
```
- [ ] Confirmed linked to correct project

### 2. Test on Staging First
```bash
supabase unlink && supabase link --project-ref ivjkdaylalhsteyyclvl
supabase functions deploy
```
- [ ] Functions deployed to staging
- [ ] Test function endpoints manually (via dashboard or curl)
- [ ] Check function logs for errors

### 3. Verify Secrets
```bash
supabase secrets list
```
- [ ] `RESEND_API_KEY` is set (if email functions changed)
- [ ] Other required secrets present

### 4. Deploy to Production
```bash
supabase unlink && supabase link --project-ref xtertgftujnebubxgqit
supabase functions deploy
```
- [ ] Functions deployed successfully
- [ ] Verify in dashboard: https://supabase.com/dashboard/project/xtertgftujnebubxgqit/functions

---

## Before Vercel Production Deploy

### 1. Preview Deployment Verified
- [ ] Preview deployment on `playr-staging.vercel.app` works
- [ ] No console errors in browser
- [ ] Authentication flows work
- [ ] Critical user journeys tested

### 2. Environment Variables
- [ ] Production env vars unchanged (or intentionally updated)
- [ ] `VITE_SUPABASE_URL` points to production
- [ ] `VITE_ENVIRONMENT=production`

### 3. Merge to Main
- [ ] PR approved
- [ ] CI pipeline passed (lint, typecheck, E2E)
- [ ] Merge and monitor Vercel deployment

---

## Emergency Rollback

### Database Migration Rollback
Most migrations are **not** automatically reversible. Options:

1. **Create a new migration** that undoes the change
2. **Restore from backup** (last resort, loses recent data)
3. **Manual SQL fix** via Supabase SQL Editor

### Edge Function Rollback
```bash
# Redeploy previous version from git
git checkout <previous-commit> -- supabase/functions/<function-name>
supabase functions deploy <function-name>
```

### Frontend Rollback
Vercel supports instant rollback:
1. Go to Vercel Dashboard → Deployments
2. Find last working deployment
3. Click "..." → "Promote to Production"

---

## Contact

If unsure about a production change, pause and review with the team.
