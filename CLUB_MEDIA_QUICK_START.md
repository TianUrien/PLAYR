# 🚀 Club Media Gallery - Quick Start Guide

## ✅ Implementation Status: COMPLETE

All frontend code is ready. Backend setup (Supabase) required before testing.

---

## 🗄️ Supabase Setup (Required)

### Step 1: Create Storage Bucket

1. Go to Supabase Dashboard → Storage
2. Click "Create Bucket"
3. Enter:
   - Name: `club-media`
   - Public: ✅ **YES**
   - File size limit: `10485760` (10 MB)
   - Allowed MIME types: `image/jpeg, image/png, image/webp`
4. Click "Create Bucket"

### Step 2: Apply Storage RLS Policies

Go to SQL Editor and run:

```sql
-- Allow public to view/download club media
CREATE POLICY "Public can view club media"
ON storage.objects FOR SELECT
USING (bucket_id = 'club-media');

-- Allow clubs to upload to their own folder
CREATE POLICY "Clubs can upload own media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'club-media' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow clubs to update their own files
CREATE POLICY "Clubs can update own media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'club-media' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow clubs to delete their own files
CREATE POLICY "Clubs can delete own media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'club-media' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

### Step 3: Create Database Table

Run in SQL Editor:

```sql
-- Create club_media table
CREATE TABLE public.club_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  caption text,
  alt_text text,
  order_index integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_club_media_club_id ON public.club_media (club_id);
CREATE INDEX idx_club_media_order ON public.club_media (club_id, order_index, created_at DESC);

-- Add caption length constraint
ALTER TABLE public.club_media
  ADD CONSTRAINT caption_max_length CHECK (char_length(caption) <= 200 OR caption IS NULL);
```

### Step 4: Apply Table RLS Policies

Run in SQL Editor:

```sql
-- Enable RLS
ALTER TABLE public.club_media ENABLE ROW LEVEL SECURITY;

-- Clubs can insert their own media
CREATE POLICY "Clubs can insert own media"
ON public.club_media FOR INSERT
WITH CHECK (auth.uid() = club_id);

-- Clubs can update their own media
CREATE POLICY "Clubs can update own media"
ON public.club_media FOR UPDATE
USING (auth.uid() = club_id);

-- Clubs can delete their own media
CREATE POLICY "Clubs can delete own media"
ON public.club_media FOR DELETE
USING (auth.uid() = club_id);

-- Everyone can view club media
CREATE POLICY "Public can view club media"
ON public.club_media FOR SELECT
USING (true);
```

---

## 🧪 Testing Steps

### Prerequisites
✅ Supabase setup complete (all 4 steps above)  
✅ Dev server running: http://localhost:5173/  
✅ Logged in as a club account

### Test Flow

1. **Navigate to Club Dashboard**
   - Go to: http://localhost:5173/dashboard/profile
   - Click "**Media**" tab

2. **Upload Photos**
   - Click "**Add Photos**" button
   - Select 1-10 photos (JPG/PNG/WebP, max 10MB each)
   - Watch progress bars
   - Verify photos appear in grid

3. **Drag & Drop Upload**
   - Drag photos from desktop onto the upload zone
   - Verify upload works

4. **Reorder Photos**
   - Drag a photo card to a new position
   - Drop it
   - Refresh page
   - Verify order persists

5. **Edit Caption**
   - Click edit icon on a photo
   - Enter caption (try 200 chars)
   - Enter alt text
   - Click "Save"
   - Verify caption displays

6. **Delete Photo**
   - Click red delete button
   - Confirm deletion
   - Verify photo disappears

7. **View Public Profile**
   - Log out (or use incognito)
   - Visit club public profile
   - Click "Media" tab
   - Verify photos visible, no edit buttons

---

## 📦 What Was Built

### Features
- ✅ Multi-file upload (up to 10 at once)
- ✅ Drag & drop upload zone
- ✅ File validation (type, size)
- ✅ Upload progress bars
- ✅ Drag-to-reorder photos
- ✅ Edit captions & alt text
- ✅ Delete photos
- ✅ Responsive grid (4/3/2/1 columns)
- ✅ Read-only public view
- ✅ Load More pagination

### Files Modified
- `client/src/lib/database.types.ts` - Added club_media types
- `client/src/components/ClubMediaTab.tsx` - Main gallery component
- `client/src/components/ClubMediaGallery.tsx` - Public gallery
- `client/src/pages/ClubDashboard.tsx` - Integrated Media tab

---

## 🚀 Dev Server

**Status**: ✅ Running  
**URL**: http://localhost:5173/  
**Build**: ✅ Successful (561.13 KB)

---

## 📝 Documentation

Full documentation available in: `CLUB_MEDIA_PREVIEW.md`

---

## ⚠️ Important

**NOT PUSHED TO GITHUB YET**

Awaiting:
1. Supabase setup completion
2. Your testing and approval
3. Any requested changes

---

**Next**: Run the Supabase SQL scripts, then test the Media tab! 🎉
