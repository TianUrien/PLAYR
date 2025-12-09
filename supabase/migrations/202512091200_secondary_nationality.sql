-- Add secondary nationality support
-- Players can have dual nationality which is important for EU work eligibility

BEGIN;

-- Add secondary nationality column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nationality2_country_id INTEGER REFERENCES public.countries(id);

-- Create index for secondary nationality
CREATE INDEX IF NOT EXISTS idx_profiles_nationality2_country ON public.profiles (nationality2_country_id);

-- Add comment
COMMENT ON COLUMN public.profiles.nationality2_country_id IS 'Secondary nationality country reference (dual nationality)';

COMMIT;
