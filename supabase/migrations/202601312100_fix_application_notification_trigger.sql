-- ============================================================================
-- Migration: Fix opportunity application notification trigger
-- ============================================================================
-- Problem: The terminology alignment migration (202601272000) rewrote
-- handle_opportunity_application_notifications() using wrong column names
-- (profile_id, type, title, body, data, priority) that don't exist on
-- profile_notifications. The correct schema uses recipient_profile_id,
-- kind, payload, etc. via the enqueue_notification() helper.
--
-- Fix: Rewrite the trigger to use enqueue_notification() with the correct
-- enum value 'vacancy_application_received' (which already exists).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_opportunity_application_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opportunity RECORD;
BEGIN
  -- Get opportunity details
  SELECT id, club_id, title INTO v_opportunity
  FROM public.opportunities
  WHERE id = NEW.opportunity_id;

  IF v_opportunity.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_notification(
      v_opportunity.club_id,        -- recipient: the club
      NEW.applicant_id,             -- actor: the applicant
      'vacancy_application_received',
      NEW.id,                       -- source_entity_id: the application
      jsonb_build_object(
        'application_id', NEW.id,
        'opportunity_id', NEW.opportunity_id,
        'opportunity_title', v_opportunity.title,
        'applicant_id', NEW.applicant_id,
        'application_status', NEW.status
      ),
      NULL                          -- target_url
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Clear old notification when status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      UPDATE public.profile_notifications
         SET cleared_at = timezone('utc', now())
       WHERE kind = 'vacancy_application_received'
         AND source_entity_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate trigger to fire on both INSERT and UPDATE
DROP TRIGGER IF EXISTS opportunity_applications_notify ON public.opportunity_applications;
CREATE TRIGGER opportunity_applications_notify
  AFTER INSERT OR UPDATE ON public.opportunity_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_opportunity_application_notifications();
