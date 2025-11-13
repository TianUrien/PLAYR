# Fix Coach Role - Instructions

## Problem Identified ✅

Your coach account was incorrectly stored in the database with `role='player'` instead of `role='coach'`. This caused two issues:

1. **Wrong Dashboard**: You were redirected to PlayerDashboard instead of CoachDashboard
2. **Wrong Badge**: The blue badge showed "Player" instead of "Coach"

## Root Cause

The `CompleteProfile.tsx` component was updating profile data but **not including the `role` field** in the update query. This meant:
- Even though you signed up as a coach (role stored in user_metadata)
- When completing your profile, the role field wasn't explicitly set
- The database defaulted to 'player' or kept whatever default was there

## Fixes Applied ✅

### 1. Fixed CompleteProfile.tsx
**Change**: Added `role: userRole` to the update data object
```typescript
let updateData: Record<string, unknown> = {
  role: userRole, // IMPORTANT: Always include role in update
  full_name: formData.fullName || formData.clubName,
  base_location: formData.city,
  nationality: formData.nationality,
}
```

This ensures that future coach signups will have their role correctly saved.

### 2. Created SQL Fix for Your Account
**File**: `fix_coach_role.sql`

## Action Required: Fix Your Existing Profile

### Step 1: Open Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the left sidebar
3. Click "New query"

### Step 2: Run the Fix SQL
Copy and paste this SQL into the editor:

```sql
-- Update your profile to have role='coach'
UPDATE public.profiles 
SET role = 'coach'
WHERE email = 'tianurien@hotmail.com'
AND role = 'player';

-- Verify the update
SELECT id, email, full_name, role, base_location, nationality
FROM public.profiles
WHERE email = 'tianurien@hotmail.com';
```

### Step 3: Execute the Query
1. Click "Run" (or press Cmd/Ctrl + Enter)
2. Check the results table at the bottom
3. Verify that `role` now shows `'coach'`

### Step 4: Refresh Your App
1. Go back to your OPLAYR app
2. **Hard refresh** the page (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
3. Or sign out and sign back in

## Expected Result ✅

After running the SQL fix and refreshing:

1. ✅ You'll be redirected to **CoachDashboard** (not PlayerDashboard)
2. ✅ The blue badge will show **"Coach"** (not "Player")
3. ✅ You'll see coach-specific fields:
   - Profile tab: Full name, years of experience, bio, passports, gender, DOB
   - Media tab: Photo gallery
   - Experience tab: (Coming soon)

## Future Coach Signups ✅

All new coach signups will now work correctly because:
- The role is properly stored during CompleteProfile
- DashboardRouter correctly routes coaches to CoachDashboard
- CoachDashboard displays coach-appropriate fields

## Testing Checklist

After running the SQL fix:
- [ ] Hard refresh the app
- [ ] Verify you see CoachDashboard (not PlayerDashboard)
- [ ] Verify the badge says "Coach"
- [ ] Verify you see coach fields (passports, gender, DOB, etc.)
- [ ] Try editing your profile - fields should save correctly
- [ ] Try uploading media to the Media tab

## If Issues Persist

1. Check the browser console for errors
2. Verify the SQL query returned 1 row updated
3. Try signing out and back in
4. Check that the database shows `role='coach'` in profiles table

---

**Status**: ✅ Fixed and deployed
**Files Changed**: 
- `client/src/pages/CompleteProfile.tsx` - Now saves role during profile completion
- `fix_coach_role.sql` - SQL to fix your existing profile

**Commit**: `3b73654` - "Fix coach role persistence - Ensure role is saved during profile completion"
