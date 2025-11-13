# Coach Avatar Upload Error - FIXED ✅

## The Problem

When uploading a profile picture as a coach, you got this error:
```
"Failed to update profile."
```

## Root Cause

The database was **missing the `bio` column** for coaches. 

### Why This Caused the Error

When you edit a coach profile, the `EditProfileModal` tries to save these fields:
```typescript
if (role === 'coach') {
  updateData.nationality = formData.nationality
  updateData.gender = formData.gender || null
  updateData.date_of_birth = formData.date_of_birth || null
  updateData.passport_1 = formData.passport_1 || null
  updateData.passport_2 = formData.passport_2 || null
  updateData.bio = formData.bio || null           // ❌ Column didn't exist!
  updateData.contact_email = formData.contact_email || null
}
```

When Supabase tried to execute this UPDATE query with the `bio` field, it failed because the column didn't exist in the `profiles` table, causing the entire profile update (including avatar_url) to fail.

---

## The Fix

### 1. ✅ Created Migration File
**File**: `supabase/migrations/20251030000000_add_coach_bio_column.sql`

```sql
-- Add bio column for coaches
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bio TEXT;

COMMENT ON COLUMN public.profiles.bio IS 'Personal biography for players and coaches';
```

### 2. ✅ Updated TypeScript Types
**File**: `client/src/lib/database.types.ts`

Added `bio: string | null` to:
- `profiles.Row`
- `profiles.Insert`
- `profiles.Update`

### 3. ✅ Created Complete Fix Script
**File**: `fix_coach_profile_complete.sql`

This script does BOTH:
- Adds the `bio` column (fixes avatar upload)
- Updates your profile role from 'player' to 'coach'

---

## What You Need to Do

### Run This SQL in Supabase

1. Go to your Supabase dashboard → **SQL Editor**
2. Click **"New query"**
3. Copy and paste the contents of **`fix_coach_profile_complete.sql`**
4. Click **"Run"** or press Cmd/Ctrl + Enter

### Expected Results

After running the SQL, you should see:

**Check 1**: Bio column exists
```
column_name | data_type
bio         | text
```

**Check 2**: Your profile shows as coach
```
role: 'coach'
email: 'tianurien@hotmail.com'
[all your profile data]
```

---

## After Running the SQL

Once you've run the SQL fix:

✅ **Avatar upload will work** - No more "Failed to update profile" error  
✅ **Bio field will save** - Coaches can add their biography  
✅ **All coach fields will save** - Gender, DOB, passports, contact email  
✅ **Profile updates will work** - Edit profile modal will work correctly  

### Test It

1. Hard refresh your app (Cmd+Shift+R)
2. Go to your coach dashboard
3. Click "Edit Profile"
4. Try uploading a profile picture → Should work! ✅
5. Add a bio in the text area → Should save! ✅
6. Update other fields → Should all work! ✅

---

## Why This Happened

When we created the CoachDashboard, we added a `bio` field to the edit form, but we **forgot to add the database column** to store it. 

The database only had:
- `club_bio` - For clubs
- No `bio` - For players/coaches

Now it has:
- `club_bio` - For clubs  
- `bio` - For players/coaches ✅

---

## Technical Details

### Storage Bucket
The `avatars` storage bucket already exists and is configured correctly:
- ✅ Bucket created: `avatars`
- ✅ Public read access enabled
- ✅ Authenticated upload/update/delete policies

### Avatar Upload Flow
```typescript
// Upload file to storage
supabase.storage.from('avatars').upload(filePath, file)

// Get public URL
const { publicUrl } = supabase.storage.from('avatars').getPublicUrl(filePath)

// Save to profile (this was failing before)
supabase.from('profiles').update({ avatar_url: publicUrl })
```

The upload to storage works fine. The issue was saving the `avatar_url` to the profile failed because the `bio` field in the same update query didn't exist.

---

## Files Changed

### New Files
1. `supabase/migrations/20251030000000_add_coach_bio_column.sql` - Migration to add bio column
2. `fix_coach_profile_complete.sql` - Complete fix script (role + bio)

### Updated Files
3. `client/src/lib/database.types.ts` - Added `bio` field to Profile type

---

## Commit

**Commit**: `29e689b` - "Add bio column for coaches - Fixes avatar upload error"

---

**Status**: ✅ Fixed in code, awaiting SQL execution in Supabase

**Next Step**: Run `fix_coach_profile_complete.sql` in Supabase SQL Editor
