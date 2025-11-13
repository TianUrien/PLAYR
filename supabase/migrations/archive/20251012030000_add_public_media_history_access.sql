-- Add public read access for gallery_photos and playing_history
-- This allows anyone to view player media and history for public profiles

-- Allow public read access to gallery photos
CREATE POLICY "Public can view all gallery photos"
  ON public.gallery_photos
  FOR SELECT
  USING (true);

-- Allow public read access to playing history
CREATE POLICY "Public can view all playing history"
  ON public.playing_history
  FOR SELECT
  USING (true);
