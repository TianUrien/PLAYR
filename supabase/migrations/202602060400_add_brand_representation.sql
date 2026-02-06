-- Add optional brand representation field for player profiles
-- e.g. "Grays Player", "adidas Athlete"

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS brand_representation TEXT NULL;

COMMENT ON COLUMN public.profiles.brand_representation
IS 'Players only: optional brand/sponsor representation (e.g. "Grays Player")';
