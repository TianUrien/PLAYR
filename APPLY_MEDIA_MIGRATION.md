# Apply Media Features Migration

## Step 1: Run Migration in Supabase SQL Editor

1. Go to your Supabase Dashboard SQL Editor:
   https://supabase.com/dashboard/project/xtertgftujnebubxgqit/sql

2. Click "New Query"

3. Copy and paste the ENTIRE contents of this file:
   `supabase/migrations/20251011190000_add_media_features.sql`

4. Click "Run" (or press Cmd+Enter)

5. You should see "Success. No rows returned" (or similar success message)

## Step 2: Verify the Changes

After running the migration, verify:

1. **Profiles table updated:**
   - Run: `SELECT highlight_video_url FROM profiles LIMIT 1;`
   - Should return a row with NULL value (column exists)

2. **Gallery_photos table created:**
   - Run: `SELECT * FROM gallery_photos LIMIT 1;`
   - Should return empty result (table exists but no data yet)

3. **Storage bucket created:**
   - Go to Storage in Supabase Dashboard
   - You should see a 'gallery' bucket alongside 'avatars'

## Step 3: Test the Features

1. **Start dev server** (if not already running):
   ```bash
   cd client && npm run dev
   ```

2. **Test Highlight Video:**
   - Log in as a Player
   - Go to Media tab
   - Click "Add Video Link"
   - Paste a YouTube URL (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)
   - Should see video preview
   - Click "Save Video"
   - Video should display with YouTube badge

3. **Test Gallery:**
   - On the same Media tab
   - Click "Add Photo"
   - Select one or more images
   - Photos should upload and display in a grid
   - Hover over a photo to see delete button
   - Delete a photo to test deletion

## Troubleshooting

### If migration fails:
- Check if the `highlight_video_url` column already exists:
  ```sql
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'profiles' AND column_name = 'highlight_video_url';
  ```
- If it exists, you can skip that part of the migration

### If gallery bucket already exists:
- Go to Storage > Gallery bucket > Policies
- Make sure these policies exist:
  - "Public can view gallery photos" (SELECT)
  - "Authenticated users can upload gallery photos" (INSERT)
  - "Authenticated users can update gallery photos" (UPDATE)
  - "Authenticated users can delete gallery photos" (DELETE)

### If TypeScript errors appear:
- The types will auto-update when you save files
- If issues persist, restart the dev server:
  ```bash
  # Stop the server (Ctrl+C)
  npm run dev
  ```

## What This Migration Does

1. **Adds `highlight_video_url` column** to profiles table
   - Stores YouTube/Vimeo/Google Drive video URLs
   - NULL by default (optional field)

2. **Creates `gallery` storage bucket**
   - Public bucket for player photos
   - Similar to the avatars bucket

3. **Creates `gallery_photos` table**
   - Tracks all uploaded gallery photos
   - Links photos to users (user_id)
   - Stores photo URLs from storage
   - Has RLS policies (users can only manage their own photos)

4. **Sets up RLS policies**
   - Public can view all gallery photos
   - Only authenticated users can upload/update/delete
   - Users can only delete their own photos (via user_id matching)

## Expected Result

After successful migration:
- Player Dashboard will have a working Media tab
- Players can add highlight videos from YouTube/Vimeo/Google Drive
- Players can upload multiple photos to their gallery
- All data persists and reloads correctly
- Video embeds display with platform badges
- Photo gallery displays in 3-column grid
