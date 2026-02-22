-- ============================================================================
-- Migration: Link opportunities to world clubs (dual coach + club identity)
-- Date: 2026-02-22
-- Description: Adds world_club_id FK to opportunities so coach-posted
--   opportunities can reference the world club they're recruiting for.
--   This enables dual-identity display (coach + club) on opportunity cards.
-- ============================================================================

-- Step 1: Add world_club_id FK to opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS world_club_id UUID
  CONSTRAINT opportunities_world_club_id_fkey
  REFERENCES public.world_clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_world_club
  ON public.opportunities(world_club_id) WHERE world_club_id IS NOT NULL;

-- Step 2: Backfill existing coach opportunities with their current_world_club_id
UPDATE public.opportunities o
SET world_club_id = p.current_world_club_id
FROM public.profiles p
WHERE o.club_id = p.id
  AND p.role = 'coach'
  AND p.current_world_club_id IS NOT NULL
  AND o.world_club_id IS NULL;

-- Step 3: Update public_opportunities view with world club columns
-- NOTE: New columns MUST be appended at the end to avoid
-- "cannot change name of view column" errors with CREATE OR REPLACE VIEW.
CREATE OR REPLACE VIEW public.public_opportunities AS
SELECT
  -- existing columns (exact same order — do not reorder)
  v.id, v.title, v.opportunity_type, v.position, v.gender,
  v.description, v.location_city, v.location_country,
  v.start_date, v.duration_text, v.application_deadline,
  v.priority, v.requirements, v.benefits, v.custom_benefits,
  v.published_at, v.created_at,
  p.full_name  AS club_name,
  p.avatar_url AS club_logo_url,
  p.base_location AS club_location,
  p.league_division AS club_league,
  p.role AS publisher_role,
  v.organization_name,
  p.current_club AS publisher_current_club,
  -- NEW columns appended at end
  wc.club_name AS world_club_name,
  wc.avatar_url AS world_club_avatar_url,
  COALESCE(ml.name, wl.name) AS world_club_league
FROM public.opportunities v
INNER JOIN public.profiles p ON p.id = v.club_id
LEFT JOIN public.world_clubs wc ON wc.id = v.world_club_id
LEFT JOIN public.world_leagues ml ON ml.id = wc.men_league_id
LEFT JOIN public.world_leagues wl ON wl.id = wc.women_league_id
WHERE v.status = 'open'
  AND COALESCE(p.is_test_account, false) = false
  AND p.onboarding_completed = true;

GRANT SELECT ON public.public_opportunities TO anon, authenticated;

-- Step 4: Re-apply security_invoker (CREATE OR REPLACE VIEW resets to SECURITY DEFINER)
ALTER VIEW public.public_opportunities SET (security_invoker = true);

-- Step 5: Update home feed trigger to include world club data in metadata
CREATE OR REPLACE FUNCTION public.generate_opportunity_posted_feed_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_profile RECORD;
  v_world_club RECORD;
BEGIN
  -- Only fire when status transitions to 'open'
  IF NEW.status = 'open'
     AND (OLD.status IS NULL OR OLD.status::text != 'open') THEN

    -- Fetch publisher profile data
    SELECT
      p.id,
      p.full_name,
      p.avatar_url,
      p.is_test_account,
      p.role
    INTO v_club_profile
    FROM profiles p
    WHERE p.id = NEW.club_id;

    -- Skip if publisher is a test account
    IF v_club_profile.is_test_account = true THEN
      RETURN NEW;
    END IF;

    -- Fetch world club data if opportunity is linked to one
    IF NEW.world_club_id IS NOT NULL THEN
      SELECT wc.club_name, wc.avatar_url
      INTO v_world_club
      FROM world_clubs wc
      WHERE wc.id = NEW.world_club_id;
    END IF;

    INSERT INTO home_feed_items (item_type, source_id, source_type, metadata)
    VALUES (
      'opportunity_posted',
      NEW.id,
      'vacancy',
      jsonb_build_object(
        'vacancy_id', NEW.id,
        'title', NEW.title,
        'opportunity_type', NEW.opportunity_type,
        'position', NEW.position,
        'gender', NEW.gender,
        'location_city', NEW.location_city,
        'location_country', NEW.location_country,
        'club_id', NEW.club_id,
        'club_name', v_club_profile.full_name,
        'club_logo', v_club_profile.avatar_url,
        'priority', NEW.priority,
        'start_date', NEW.start_date,
        'publisher_role', v_club_profile.role,
        'world_club_name', v_world_club.club_name,
        'world_club_avatar', v_world_club.avatar_url
      )
    )
    ON CONFLICT (item_type, source_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
