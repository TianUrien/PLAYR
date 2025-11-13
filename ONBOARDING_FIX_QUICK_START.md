# 🚀 Quick Start Guide - Onboarding Visibility Fix

## What Was Fixed
✅ Users no longer appear in Community → New Members until they complete onboarding  
✅ Added optional profile photo upload during signup  
✅ No more broken "?" cards with missing data

---

## Run This Migration FIRST

**Go to Supabase Dashboard → SQL Editor** and run:

```sql
-- Copy the ENTIRE content from this file:
supabase/migrations/20251103120000_add_onboarding_completed.sql
```

Or paste this directly:

```sql
-- Add onboarding_completed flag to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed 
ON public.profiles(onboarding_completed);

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_created 
ON public.profiles(onboarding_completed, created_at DESC) 
WHERE onboarding_completed = true;

-- Backfill existing complete profiles
UPDATE public.profiles SET onboarding_completed = true
WHERE role = 'player'
  AND full_name IS NOT NULL AND full_name != ''
  AND base_location IS NOT NULL AND base_location != ''
  AND nationality IS NOT NULL AND nationality != ''
  AND position IS NOT NULL AND position != ''
  AND gender IS NOT NULL AND gender != '';

UPDATE public.profiles SET onboarding_completed = true
WHERE role = 'coach'
  AND full_name IS NOT NULL AND full_name != ''
  AND base_location IS NOT NULL AND base_location != ''
  AND nationality IS NOT NULL AND nationality != ''
  AND gender IS NOT NULL AND gender != '';

UPDATE public.profiles SET onboarding_completed = true
WHERE role = 'club'
  AND full_name IS NOT NULL AND full_name != ''
  AND base_location IS NOT NULL AND base_location != ''
  AND nationality IS NOT NULL AND nationality != '';
```

---

## Test on Localhost

### Start the Dev Server
```bash
cd client
npm run dev
```

### Test Scenarios

#### ✅ Test 1: New User (Should Appear After Onboarding)
1. Create new account
2. Verify email
3. Complete profile form (with or without photo)
4. Go to Community page
5. **Expected**: Your profile appears with complete data

#### ✅ Test 2: Incomplete Profile (Should Be Hidden)
1. Create new account
2. Verify email
3. **Don't complete the form**
4. Go to Community page
5. **Expected**: Your profile does NOT appear

#### ✅ Test 3: Existing Users (Should Still Appear)
1. Go to Community page
2. **Expected**: Existing complete profiles still show
3. **Expected**: No "?" or broken cards

---

## What Changed

### Files Modified:
1. **Database**: Added `onboarding_completed` column to profiles table
2. **CompleteProfile.tsx**: Sets flag to true when form submitted
3. **CompleteProfile.tsx**: Added optional profile photo upload UI
4. **CommunityPage.tsx**: Filters to only show completed profiles

### New Feature:
📸 **Profile Photo Upload** during onboarding (optional)
- Appears at top of onboarding form
- Purple gradient UI with camera icon
- Optional - users can skip
- Image optimization (max 800x800, 500KB)

---

## Verify Success

### In Browser:
- [ ] Community page only shows complete profiles
- [ ] No "?" or broken cards
- [ ] New signups appear after completing onboarding
- [ ] Avatar upload works (if user chooses to use it)

### In Database:
- [ ] Column `onboarding_completed` exists in profiles table
- [ ] Complete profiles have `onboarding_completed = true`
- [ ] Incomplete profiles have `onboarding_completed = false`

---

## If Something Goes Wrong

### Issue: No profiles show in Community
**Fix**: Run the migration again, especially the UPDATE queries (backfill section)

### Issue: Avatar upload fails
**Fix**: Check that `avatars` storage bucket exists with correct RLS policies

### Issue: TypeScript errors
**Fix**: Restart VS Code TypeScript server

---

## Ready to Push to GitHub?

Once testing is complete and everything works:

```bash
git add .
git commit -m "feat: Add onboarding visibility gate and avatar upload

- Add onboarding_completed flag to profiles table
- Filter Community listings to show only complete profiles
- Add optional profile photo upload to onboarding flow
- Backfill existing complete profiles automatically
- Add database indexes for performance
- Hide incomplete/broken profile cards from public view"

git push origin main
```

---

## 📚 Full Documentation

For complete details, see:
- **ONBOARDING_VISIBILITY_FIX.md** - Comprehensive implementation guide
- **TESTING_CHECKLIST.md** - Detailed testing scenarios

---

**Time to Test**: 10-15 minutes  
**Ready to Deploy**: After successful localhost testing ✅
