-- Add public read access for player profiles
-- This allows anyone to view basic player information for public profiles and applicant viewing

CREATE POLICY "Public can view player profiles"
  ON public.profiles
  FOR SELECT
  USING (role = 'player');
