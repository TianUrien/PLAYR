-- Split club league/division into separate free-text fields for women's and men's teams.
-- Existing profiles.league_division is left untouched for backward compatibility.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS womens_league_division TEXT,
  ADD COLUMN IF NOT EXISTS mens_league_division TEXT;

COMMENT ON COLUMN public.profiles.womens_league_division IS 'Club women''s team league/division (free text)';
COMMENT ON COLUMN public.profiles.mens_league_division IS 'Club men''s team league/division (free text)';
