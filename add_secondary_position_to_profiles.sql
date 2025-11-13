-- Adds an optional secondary_position field for player profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS secondary_position text;

-- Optional: backfill existing rows to NULL explicitly (noop but documents intent)
UPDATE public.profiles
SET secondary_position = NULL
WHERE secondary_position IS NULL;
