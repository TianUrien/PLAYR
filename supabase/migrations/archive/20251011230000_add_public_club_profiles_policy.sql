-- Add public read access for club profiles
-- This allows anyone to view basic club information when browsing opportunities

CREATE POLICY "Public can view club profiles"
  ON public.profiles
  FOR SELECT
  USING (role = 'club');
