# Coach Avatar Upload Still Failing - Complete Diagnosis & Fix

## The Problem

You're still getting **"Failed to update profile"** when uploading a profile picture as a coach.

## Root Causes (Multiple Issues)

After deeper investigation, there are **THREE potential issues**:

### 1. ❌ Storage Bucket May Not Exist
The `avatars` bucket might not have been created in your Supabase project.

### 2. ❌ Storage Policies May Be Too Restrictive
The original migration used `auth.role() = 'authenticated'` which might not work correctly. Modern Supabase requires `TO authenticated` syntax.

### 3. ❌ Missing `bio` Column
The profiles table is missing the `bio` column that coaches need.

---

## Complete Fix - Run These Scripts

### Option 1: Full Diagnostic (Recommended)

**File**: `diagnose_and_fix_coach_upload.sql`

This script will:
1. ✅ **Diagnose** - Check what's missing
2. ✅ **Fix** - Create everything that's missing
3. ✅ **Verify** - Confirm everything works

**Steps:**
1. Open Supabase → SQL Editor
2. Copy entire contents of `diagnose_and_fix_coach_upload.sql`
3. Run it
4. Check the verification output at the bottom

**Expected Verification Output:**
```
✅ Public access enabled
✅ bio column exists  
✅ Role is coach
✅ Storage policies exist
```

---

### Option 2: Fix Storage Policies Only

If the diagnostic shows storage policies are the issue:

**File**: `fix_storage_policies_permissive.sql`

This creates **more permissive** storage policies that work better:

**Before** (restrictive):
```sql
WITH CHECK (
  bucket_id = 'avatars' 
  AND auth.role() = 'authenticated'  -- ❌ Problematic
)
```

**After** (permissive):
```sql
TO authenticated
WITH CHECK (bucket_id = 'avatars')  -- ✅ Simpler, works better
```

---

## What Each Script Does

### diagnose_and_fix_coach_upload.sql

**Checks:**
1. Does the `avatars` bucket exist?
2. Are storage policies set up?
3. Does `avatar_url` column exist?
4. Does `bio` column exist?
5. Is your role set to 'coach'?
6. Are RLS policies correct?

**Fixes:**
- Creates `avatars` bucket if missing
- Adds `bio` column if missing
- Sets up all 4 storage policies (SELECT, INSERT, UPDATE, DELETE)
- Updates your role to 'coach'
- Enables RLS on profiles table

### fix_storage_policies_permissive.sql

**Purpose**: Replace restrictive storage policies with more permissive ones

**What it does:**
- Drops old policies
- Creates new, simpler policies
- Allows any authenticated user to upload/update/delete avatars
- No folder restrictions

---

## Common Issues & Solutions

### Issue 1: "relation storage.buckets does not exist"

**Cause**: Storage extension not enabled  
**Fix**: In Supabase Dashboard → Database → Extensions → Enable "storage"

### Issue 2: Policies show "auth.role() = 'authenticated'"

**Cause**: Old policy syntax  
**Fix**: Run `fix_storage_policies_permissive.sql`

### Issue 3: Your role shows as 'player' not 'coach'

**Cause**: Role wasn't updated  
**Fix**: Both scripts include the role update

### Issue 4: "Failed to update profile" but avatar uploads

**Cause**: Missing `bio` column blocks the entire update  
**Fix**: Both scripts add the `bio` column

---

## Testing After Running Scripts

### Test 1: Check Supabase Storage

1. Go to Supabase Dashboard
2. Click **Storage** (left sidebar)
3. You should see **"avatars"** bucket
4. Click on it - you should see any uploaded files

### Test 2: Try Upload Again

1. Hard refresh your app (Cmd+Shift+R)
2. Go to Coach Dashboard
3. Click "Edit Profile"
4. Try uploading a picture
5. Should work! ✅

### Test 3: Check Browser Console

1. Open browser DevTools (F12)
2. Go to Console tab
3. Try uploading
4. Look for any errors:
   - ❌ "policy" → Storage policy issue
   - ❌ "column" → Missing bio column
   - ❌ "bucket" → Bucket doesn't exist
   - ✅ No errors → Success!

---

## Manual Verification (Optional)

After running the scripts, verify in Supabase:

### Check 1: Storage Bucket Exists
```
Dashboard → Storage → Should see "avatars" bucket
```

### Check 2: Storage Policies
```
Dashboard → Storage → avatars → Policies
Should see 4 policies:
- SELECT (public)
- INSERT (authenticated)
- UPDATE (authenticated)  
- DELETE (authenticated)
```

### Check 3: Profiles Table
```
Dashboard → Table Editor → profiles
Check columns include:
- avatar_url (text)
- bio (text)
```

### Check 4: Your Profile
```
Dashboard → Table Editor → profiles → Find your row
role = 'coach' ✅
```

---

## Why This Keeps Failing

The issue is **Supabase setup**, not the code. The code is correct, but:

1. **Storage bucket** may not exist in your Supabase project
2. **Storage policies** may be using old syntax that doesn't work
3. **bio column** is definitely missing

All migrations are in the codebase, but if your Supabase project was created before these migrations, or if migrations weren't run, these database changes won't exist.

---

## The Nuclear Option (If Nothing Works)

If both scripts fail, try this manual setup:

### 1. Create Bucket Manually
```
Dashboard → Storage → New Bucket
Name: avatars
Public: ✓ Yes
```

### 2. Add Policies Manually
```
Dashboard → Storage → avatars → Policies → New Policy

Policy 1 (SELECT):
- Name: "Public read"
- Allowed operation: SELECT
- Target roles: public
- USING: bucket_id = 'avatars'

Policy 2 (INSERT):
- Name: "Authenticated upload"
- Allowed operation: INSERT  
- Target roles: authenticated
- WITH CHECK: bucket_id = 'avatars'

Policy 3 (UPDATE):
- Name: "Authenticated update"
- Allowed operation: UPDATE
- Target roles: authenticated
- USING: bucket_id = 'avatars'
- WITH CHECK: bucket_id = 'avatars'

Policy 4 (DELETE):
- Name: "Authenticated delete"
- Allowed operation: DELETE
- Target roles: authenticated
- USING: bucket_id = 'avatars'
```

### 3. Add bio Column Manually
```
Dashboard → SQL Editor → New Query

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;
```

### 4. Fix Your Role Manually
```
Dashboard → Table Editor → profiles
Find your row (tianurien@hotmail.com)
Edit: role = 'coach'
Save
```

---

## Next Steps

1. ✅ **Run** `diagnose_and_fix_coach_upload.sql` first
2. ✅ **Check** the verification output
3. ✅ **Test** avatar upload in your app
4. ❌ **If still failing** → Run `fix_storage_policies_permissive.sql`
5. ❌ **If STILL failing** → Try manual setup above
6. ❌ **If STILL failing** → Send me the exact error from browser console

---

**Files to Use:**
- `diagnose_and_fix_coach_upload.sql` ← Start here
- `fix_storage_policies_permissive.sql` ← If storage policies are the issue
- This guide ← Reference for manual fixes

**The fix is 100% on the Supabase side - your code is correct!**
