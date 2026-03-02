-- ============================================================================
-- Migration: Brand Ambassadors — Bilateral Consent
-- Date: 2026-03-03
-- Description: Converts ambassador system from unilateral to bilateral consent.
--   1. Add status + responded_at columns, backfill existing rows
--   2. Add notification enum values
--   3. Replace add_brand_ambassador (now creates pending request)
--   4. Replace remove_brand_ambassador (clears notification on pending cancel)
--   5. New RPC: respond_to_ambassador_request (player accept/decline)
--   6. New RPC: leave_brand_ambassadorship (player opt-out)
--   7. Replace get_brand_ambassadors (adds status filter + returns id/status)
--   8. Replace get_brand_ambassadors_public (accepted only)
--   9. Replace get_my_brand_analytics (count accepted only)
--  10. New RPC: get_my_ambassador_invitations (player-facing)
--  11. Notification trigger function + trigger
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. Add status + responded_at columns
-- ============================================================================

ALTER TABLE public.brand_ambassadors
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Backfill: existing rows were added under the old unilateral model → mark as accepted
UPDATE public.brand_ambassadors
  SET status = 'accepted', responded_at = created_at
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_brand_ambassadors_brand_status
  ON public.brand_ambassadors(brand_id, status);

-- ============================================================================
-- 2. Add notification enum values
-- ============================================================================

ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'ambassador_request_received';
ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'ambassador_request_accepted';

-- ============================================================================
-- 3. Replace add_brand_ambassador — now creates a pending request
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_brand_ambassador(
  p_brand_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_brand_profile_id UUID;
  v_player_role TEXT;
  v_existing_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller owns this brand
  SELECT profile_id INTO v_brand_profile_id
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  IF v_brand_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  IF v_brand_profile_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Verify target is a player with completed onboarding
  SELECT role INTO v_player_role
  FROM profiles WHERE id = p_player_id AND onboarding_completed = true;

  IF v_player_role IS NULL OR v_player_role != 'player' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only players can be ambassadors');
  END IF;

  -- Check for existing row
  SELECT status INTO v_existing_status
  FROM brand_ambassadors
  WHERE brand_id = p_brand_id AND player_id = p_player_id;

  IF v_existing_status = 'accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player is already an ambassador');
  END IF;

  IF v_existing_status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request already pending');
  END IF;

  -- If declined, delete old row to allow re-invitation
  IF v_existing_status = 'declined' THEN
    DELETE FROM brand_ambassadors
    WHERE brand_id = p_brand_id AND player_id = p_player_id;
  END IF;

  -- Insert new pending request
  INSERT INTO brand_ambassadors (brand_id, player_id, status)
  VALUES (p_brand_id, p_player_id, 'pending')
  ON CONFLICT (brand_id, player_id) DO NOTHING;

  -- Do NOT update ambassador_count (pending doesn't count)

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_brand_ambassador(UUID, UUID) TO authenticated;

-- ============================================================================
-- 4. Replace remove_brand_ambassador — handles pending + accepted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_brand_ambassador(
  p_brand_id UUID,
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_brand_profile_id UUID;
  v_deleted_id UUID;
  v_deleted_status TEXT;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Verify caller owns this brand
  SELECT profile_id INTO v_brand_profile_id
  FROM brands WHERE id = p_brand_id AND deleted_at IS NULL;

  IF v_brand_profile_id IS NULL OR v_brand_profile_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  -- Delete and capture what was removed
  DELETE FROM brand_ambassadors
  WHERE brand_id = p_brand_id AND player_id = p_player_id
  RETURNING id, status INTO v_deleted_id, v_deleted_status;

  -- If we cancelled a pending request, clear its notification
  IF v_deleted_id IS NOT NULL AND v_deleted_status = 'pending' THEN
    UPDATE profile_notifications
       SET cleared_at = timezone('utc', now())
     WHERE kind = 'ambassador_request_received'
       AND source_entity_id = v_deleted_id;
  END IF;

  -- Recount accepted only
  SELECT COUNT(*) INTO v_new_count
  FROM brand_ambassadors WHERE brand_id = p_brand_id AND status = 'accepted';

  UPDATE brands SET ambassador_count = v_new_count WHERE id = p_brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_brand_ambassador(UUID, UUID) TO authenticated;

-- ============================================================================
-- 5. New RPC: respond_to_ambassador_request (player accept/decline)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.respond_to_ambassador_request(
  p_brand_ambassador_id UUID,
  p_accept BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row RECORD;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Fetch the ambassador row
  SELECT id, brand_id, player_id, status
  INTO v_row
  FROM brand_ambassadors
  WHERE id = p_brand_ambassador_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_row.player_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_row.status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is no longer pending');
  END IF;

  IF p_accept THEN
    -- Accept: update status
    UPDATE brand_ambassadors
       SET status = 'accepted', responded_at = timezone('utc', now())
     WHERE id = p_brand_ambassador_id;

    -- Recount accepted → update brands.ambassador_count
    SELECT COUNT(*) INTO v_new_count
    FROM brand_ambassadors WHERE brand_id = v_row.brand_id AND status = 'accepted';

    UPDATE brands SET ambassador_count = v_new_count WHERE id = v_row.brand_id;
  ELSE
    -- Decline: delete the row (allows brand to re-invite later)
    DELETE FROM brand_ambassadors WHERE id = p_brand_ambassador_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_to_ambassador_request(UUID, BOOLEAN) TO authenticated;

-- ============================================================================
-- 6. New RPC: leave_brand_ambassadorship (player opt-out)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_brand_ambassadorship(
  p_brand_ambassador_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_row RECORD;
  v_new_count INT;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT id, brand_id, player_id
  INTO v_row
  FROM brand_ambassadors
  WHERE id = p_brand_ambassador_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not found');
  END IF;

  IF v_row.player_id != v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  DELETE FROM brand_ambassadors WHERE id = p_brand_ambassador_id;

  -- Recount accepted
  SELECT COUNT(*) INTO v_new_count
  FROM brand_ambassadors WHERE brand_id = v_row.brand_id AND status = 'accepted';

  UPDATE brands SET ambassador_count = v_new_count WHERE id = v_row.brand_id;

  RETURN jsonb_build_object(
    'success', true,
    'ambassador_count', v_new_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_brand_ambassadorship(UUID) TO authenticated;

-- ============================================================================
-- 7. Replace get_brand_ambassadors — new signature with status filter
-- ============================================================================

-- Drop old 3-arg version (new version has 4 args with p_status)
DROP FUNCTION IF EXISTS public.get_brand_ambassadors(UUID, INT, INT);

CREATE OR REPLACE FUNCTION public.get_brand_ambassadors(
  p_brand_id UUID,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_ambassadors JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM brand_ambassadors
  WHERE brand_id = p_brand_id
    AND (p_status IS NULL OR status = p_status);

  SELECT COALESCE(jsonb_agg(row_data ORDER BY added_at DESC), '[]'::jsonb)
  INTO v_ambassadors
  FROM (
    SELECT
      jsonb_build_object(
        'id', ba.id,
        'player_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'role', p.role,
        'position', p.position,
        'base_location', p.base_location,
        'current_club', p.current_club,
        'status', ba.status,
        'added_at', ba.created_at,
        'responded_at', ba.responded_at
      ) AS row_data,
      ba.created_at AS added_at
    FROM brand_ambassadors ba
    JOIN profiles p ON p.id = ba.player_id
    WHERE ba.brand_id = p_brand_id
      AND (p_status IS NULL OR ba.status = p_status)
    ORDER BY ba.created_at DESC
    LIMIT LEAST(p_limit, 50)
    OFFSET p_offset
  ) sub;

  RETURN jsonb_build_object(
    'ambassadors', v_ambassadors,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_ambassadors(UUID, TEXT, INT, INT) TO authenticated;

-- ============================================================================
-- 8. Replace get_brand_ambassadors_public — accepted only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_brand_ambassadors_public(
  p_brand_id UUID,
  p_limit INT DEFAULT 12
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_ambassadors JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM brand_ambassadors
  WHERE brand_id = p_brand_id AND status = 'accepted';

  SELECT COALESCE(jsonb_agg(row_data ORDER BY added_at DESC), '[]'::jsonb)
  INTO v_ambassadors
  FROM (
    SELECT
      jsonb_build_object(
        'player_id', p.id,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url,
        'position', p.position,
        'current_club', p.current_club
      ) AS row_data,
      ba.created_at AS added_at
    FROM brand_ambassadors ba
    JOIN profiles p ON p.id = ba.player_id
    WHERE ba.brand_id = p_brand_id AND ba.status = 'accepted'
    ORDER BY ba.created_at DESC
    LIMIT LEAST(p_limit, 12)
  ) sub;

  RETURN jsonb_build_object(
    'ambassadors', v_ambassadors,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_brand_ambassadors_public(UUID, INT) TO anon, authenticated;

-- ============================================================================
-- 9. Replace get_my_brand_analytics — count accepted only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_brand_analytics(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_role TEXT;
  v_brand_id UUID;
  v_profile_id UUID;
  v_profile_views BIGINT := 0;
  v_profile_views_previous BIGINT := 0;
  v_follower_count INT := 0;
  v_product_count BIGINT := 0;
  v_post_count BIGINT := 0;
  v_ambassador_count BIGINT := 0;
  v_period_start TIMESTAMPTZ;
  v_previous_start TIMESTAMPTZ;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT role INTO v_user_role FROM profiles WHERE id = v_user_id;
  IF v_user_role != 'brand' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only brand users can view brand analytics');
  END IF;

  SELECT id, profile_id INTO v_brand_id, v_profile_id
  FROM brands WHERE profile_id = v_user_id AND deleted_at IS NULL;

  IF v_brand_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Brand not found');
  END IF;

  v_period_start := now() - (p_days || ' days')::interval;
  v_previous_start := v_period_start - (p_days || ' days')::interval;

  SELECT COUNT(*) INTO v_profile_views
  FROM events
  WHERE event_name = 'profile_view'
    AND entity_type = 'profile'
    AND entity_id = v_profile_id
    AND created_at >= v_period_start;

  SELECT COUNT(*) INTO v_profile_views_previous
  FROM events
  WHERE event_name = 'profile_view'
    AND entity_type = 'profile'
    AND entity_id = v_profile_id
    AND created_at >= v_previous_start
    AND created_at < v_period_start;

  SELECT COALESCE(b.follower_count, 0) INTO v_follower_count
  FROM brands b WHERE b.id = v_brand_id;

  SELECT COUNT(*) INTO v_product_count
  FROM brand_products WHERE brand_id = v_brand_id AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_post_count
  FROM brand_posts WHERE brand_id = v_brand_id AND deleted_at IS NULL;

  -- Ambassador count (accepted only)
  SELECT COUNT(*) INTO v_ambassador_count
  FROM brand_ambassadors WHERE brand_id = v_brand_id AND status = 'accepted';

  RETURN jsonb_build_object(
    'success', true,
    'profile_views', v_profile_views,
    'profile_views_previous', v_profile_views_previous,
    'follower_count', v_follower_count,
    'product_count', v_product_count,
    'post_count', v_post_count,
    'ambassador_count', v_ambassador_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_brand_analytics(INT) TO authenticated;

-- ============================================================================
-- 10. New RPC: get_my_ambassador_invitations (player-facing)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_ambassador_invitations()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invitations JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_invitations
  FROM (
    SELECT
      jsonb_build_object(
        'id', ba.id,
        'brand_id', ba.brand_id,
        'brand_name', b.name,
        'brand_logo_url', b.logo_url,
        'brand_category', b.category,
        'created_at', ba.created_at
      ) AS row_data,
      ba.created_at
    FROM brand_ambassadors ba
    JOIN brands b ON b.id = ba.brand_id AND b.deleted_at IS NULL
    WHERE ba.player_id = v_user_id
      AND ba.status = 'pending'
    ORDER BY ba.created_at DESC
    LIMIT 50
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'invitations', v_invitations
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_ambassador_invitations() TO authenticated;

-- ============================================================================
-- 11. Notification trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_ambassador_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_brand_profile_id UUID;
  v_brand_name TEXT;
  now_ts TIMESTAMPTZ := timezone('utc', now());
BEGIN
  -- Look up the brand owner
  SELECT b.profile_id, b.name INTO v_brand_profile_id, v_brand_name
  FROM brands b WHERE b.id = NEW.brand_id AND b.deleted_at IS NULL;

  IF v_brand_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT with status='pending' → notify the player
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public.enqueue_notification(
      NEW.player_id,
      v_brand_profile_id,
      'ambassador_request_received',
      NEW.id,
      jsonb_build_object(
        'brand_ambassador_id', NEW.id,
        'brand_id', NEW.brand_id,
        'brand_name', v_brand_name
      ),
      NULL
    );
    RETURN NEW;
  END IF;

  -- UPDATE: status transitions
  IF TG_OP = 'UPDATE' THEN
    -- Clear pending notification when status leaves 'pending'
    IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'ambassador_request_received'
         AND source_entity_id = NEW.id;

      -- If accepted, notify the brand owner
      IF NEW.status = 'accepted' THEN
        PERFORM public.enqueue_notification(
          v_brand_profile_id,
          NEW.player_id,
          'ambassador_request_accepted',
          NEW.id,
          jsonb_build_object(
            'brand_ambassador_id', NEW.id,
            'brand_id', NEW.brand_id,
            'player_id', NEW.player_id
          ),
          NULL
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brand_ambassadors_notify ON public.brand_ambassadors;
CREATE TRIGGER brand_ambassadors_notify
  AFTER INSERT OR UPDATE ON public.brand_ambassadors
  FOR EACH ROW EXECUTE FUNCTION public.handle_ambassador_request_notification();

NOTIFY pgrst, 'reload schema';
