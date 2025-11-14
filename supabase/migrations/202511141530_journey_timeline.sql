BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'journey_entry_type' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.journey_entry_type AS ENUM (
      'club',
      'national_team',
      'achievement',
      'tournament',
      'milestone',
      'academy',
      'other'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'playing_history'
      AND column_name = 'achievements'
  ) THEN
    ALTER TABLE public.playing_history
      RENAME COLUMN achievements TO highlights;
  END IF;
END
$$;

ALTER TABLE public.playing_history
  ADD COLUMN IF NOT EXISTS entry_type public.journey_entry_type NOT NULL DEFAULT 'club',
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS location_country TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS badge_label TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE OR REPLACE FUNCTION public.try_parse_years_component(years TEXT, component TEXT)
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned TEXT;
  result DATE;
BEGIN
  IF years IS NULL OR trim(years) = '' THEN
    RETURN NULL;
  END IF;

  IF component = 'start' THEN
    cleaned := split_part(years, '-', 1);
  ELSE
    cleaned := split_part(years, '-', 2);
  END IF;

  cleaned := NULLIF(trim(cleaned), '');
  IF cleaned IS NULL OR lower(cleaned) = 'present' THEN
    RETURN NULL;
  END IF;

  BEGIN
    result := to_date(cleaned, 'Mon YYYY');
    RETURN result;
  EXCEPTION WHEN others THEN
    BEGIN
      result := to_date(cleaned, 'YYYY');
      RETURN result;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  END;
END;
$$;

UPDATE public.playing_history
SET
  start_date = COALESCE(start_date, public.try_parse_years_component(years, 'start')),
  end_date = COALESCE(end_date, public.try_parse_years_component(years, 'end'))
WHERE start_date IS NULL AND years IS NOT NULL;

COMMIT;
