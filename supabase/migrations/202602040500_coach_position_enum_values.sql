-- Add coach position values to the opportunity_position enum.
-- PostgreSQL doesn't support IF NOT EXISTS for ADD VALUE, but duplicate
-- adds are a no-op error, so we wrap each in its own DO block that
-- catches the duplicate_object exception.

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'head_coach';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'assistant_coach';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.opportunity_position ADD VALUE 'youth_coach';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
