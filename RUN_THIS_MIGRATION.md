# ✅ Fixed Migration - Ready to Run!

## The Issue
The migration failed because the `highlight_video_url` column already exists in your profiles table.

## The Fix
I've updated the migration file to be **idempotent** (safe to run multiple times). It now:
- ✅ Checks if the column exists before adding it
- ✅ Uses `CREATE TABLE IF NOT EXISTS` 
- ✅ Uses `DROP POLICY IF EXISTS` before creating policies
- ✅ Uses `ON CONFLICT DO NOTHING` for the storage bucket
- ✅ Uses `DROP INDEX IF EXISTS` before creating the index

## Run the Migration Again

1. **Go to Supabase SQL Editor:**
   https://supabase.com/dashboard/project/xtertgftujnebubxgqit/sql

2. **Copy the ENTIRE updated SQL** from:
   `supabase/migrations/20251011190000_add_media_features.sql`

3. **Paste into SQL Editor** and click **Run**

4. **Should now see:** "Success. No rows returned"

## What It Will Do

✅ Skip adding `highlight_video_url` (already exists)
✅ Create `gallery` storage bucket (if not exists)
✅ Set up storage policies for gallery uploads
✅ Create `gallery_photos` table to track uploads
✅ Set up RLS policies (users can only manage their own photos)
✅ Create database index for faster queries

## After Running

Your Media tab will work perfectly! You'll be able to:
- Add highlight videos (YouTube, Vimeo, Google Drive)
- Upload gallery photos
- Delete videos and photos
- Everything persists across sessions

## Test It

1. Log in as a Player
2. Go to Media tab
3. Click "Add Video Link" → Paste a YouTube URL → Save
4. Click "Add Photo" → Upload some images
5. Refresh page → Everything should still be there!

## Need Help?

If you see any other errors, let me know the exact error message and I'll fix it immediately! 🚀
