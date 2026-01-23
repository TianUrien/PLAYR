-- Admin World Portal - Add 'admin' to created_from constraint
-- Allows admins to add clubs directly from the Admin Portal

BEGIN;

-- Drop existing constraint and add new one with 'admin' value
ALTER TABLE public.world_clubs
  DROP CONSTRAINT IF EXISTS world_clubs_created_from_check;

ALTER TABLE public.world_clubs
  ADD CONSTRAINT world_clubs_created_from_check
  CHECK (created_from IN ('seed', 'user', 'admin'));

COMMENT ON COLUMN public.world_clubs.created_from IS 'Origin of club entry: seed (migration), user (claimed during onboarding), admin (added via Admin Portal)';

COMMIT;
