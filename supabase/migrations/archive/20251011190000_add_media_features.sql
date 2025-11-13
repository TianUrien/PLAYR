-- Add highlight_video_url to profiles table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'highlight_video_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN highlight_video_url TEXT;
  END IF;
END $$;

-- Create gallery storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery', 'gallery', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for gallery bucket
-- Allow public to view gallery photos
DROP POLICY IF EXISTS "Public can view gallery photos" ON storage.objects;
CREATE POLICY "Public can view gallery photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

-- Allow authenticated users to upload to gallery
DROP POLICY IF EXISTS "Authenticated users can upload gallery photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload gallery photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'gallery' 
  AND auth.role() = 'authenticated'
);

-- Allow users to update their own gallery photos
DROP POLICY IF EXISTS "Authenticated users can update gallery photos" ON storage.objects;
CREATE POLICY "Authenticated users can update gallery photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'gallery'
  AND auth.role() = 'authenticated'
);

-- Allow users to delete their own gallery photos
DROP POLICY IF EXISTS "Authenticated users can delete gallery photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete gallery photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'gallery'
  AND auth.role() = 'authenticated'
);

-- Create gallery_photos table to track uploaded images
CREATE TABLE IF NOT EXISTS gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on gallery_photos
ALTER TABLE gallery_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gallery_photos
-- Users can view their own gallery photos
DROP POLICY IF EXISTS "Users can view their own gallery photos" ON gallery_photos;
CREATE POLICY "Users can view their own gallery photos"
ON gallery_photos FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own gallery photos
DROP POLICY IF EXISTS "Users can insert their own gallery photos" ON gallery_photos;
CREATE POLICY "Users can insert their own gallery photos"
ON gallery_photos FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own gallery photos
DROP POLICY IF EXISTS "Users can delete their own gallery photos" ON gallery_photos;
CREATE POLICY "Users can delete their own gallery photos"
ON gallery_photos FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
DROP INDEX IF EXISTS idx_gallery_photos_user_id;
CREATE INDEX idx_gallery_photos_user_id ON gallery_photos(user_id);
