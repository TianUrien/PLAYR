# Fix Storage RLS Policies

## The Problem
You're getting "new row violates row-level security policy" when trying to upload images.

## The Solution
Run this SQL in your Supabase SQL Editor:

### Step 1: Go to Supabase Dashboard
1. Open https://supabase.com/dashboard/project/xtertgftujnebubxgqit
2. Click on **SQL Editor** in the left sidebar
3. Click **New query**

### Step 2: Copy and Paste This SQL

```sql
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

-- Create new permissive policies for avatars bucket

-- Allow everyone to view avatars (public read)
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow ALL authenticated users to upload
CREATE POLICY "Authenticated can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow ALL authenticated users to update
CREATE POLICY "Authenticated can update avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'avatars');

-- Allow ALL authenticated users to delete
CREATE POLICY "Authenticated can delete avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'avatars');
```

### Step 3: Run the Query
1. Click **Run** (or press Cmd/Ctrl + Enter)
2. You should see "Success. No rows returned"

### Step 4: Test Again
1. Go back to your app: http://localhost:5173/dashboard/profile
2. Click "Update Club Information"
3. Try uploading your club logo again
4. It should work now! ✅

## What This Does
- **Removes** the old restrictive policies that were blocking uploads
- **Creates** new permissive policies that allow any authenticated user to upload/update/delete
- **Keeps** public read access so anyone can view the avatars

## Why This Works
The old policies were trying to match user IDs with folder names, which was failing. The new policies simply check:
- Is the user authenticated? ✅
- Is the bucket 'avatars'? ✅
- If yes to both → Allow the upload! 🎉
