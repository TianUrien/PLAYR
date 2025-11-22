set check_function_bodies = off;
set search_path = public;

-- ============================================================================
-- Enum updates
-- ============================================================================
DO $$ BEGIN
  ALTER TYPE public.profile_notification_kind ADD VALUE IF NOT EXISTS 'reference_request_rejected';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Remove chat-driven notifications
-- ============================================================================
DROP TRIGGER IF EXISTS messages_notify ON public.messages;
DROP FUNCTION IF EXISTS public.handle_message_notifications();

-- ============================================================================
-- References → notifications (reject support, narrow scope)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_profile_reference_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts timestamptz := timezone('utc', now());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending' THEN
      PERFORM public.enqueue_notification(
        NEW.reference_id,
        NEW.requester_id,
        'reference_request_received',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'requester_id', NEW.requester_id,
          'relationship_type', NEW.relationship_type,
          'request_note', NEW.request_note
        ),
        NULL
      );
    ELSIF NEW.status = 'accepted' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_accepted',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'endorsement_text', NEW.endorsement_text
        ),
        NULL
      );
    ELSIF NEW.status = 'declined' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_rejected',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'status', NEW.status
        ),
        NULL
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'declined', 'revoked') THEN
      UPDATE public.profile_notifications
         SET cleared_at = now_ts
       WHERE kind = 'reference_request_received'
         AND source_entity_id = NEW.id;
    END IF;

    IF OLD.status <> 'accepted' AND NEW.status = 'accepted' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_accepted',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'endorsement_text', NEW.endorsement_text
        ),
        NULL
      );
    ELSIF OLD.status <> 'declined' AND NEW.status = 'declined' THEN
      PERFORM public.enqueue_notification(
        NEW.requester_id,
        NEW.reference_id,
        'reference_request_rejected',
        NEW.id,
        jsonb_build_object(
          'reference_id', NEW.id,
          'reference_profile_id', NEW.reference_id,
          'relationship_type', NEW.relationship_type,
          'status', NEW.status
        ),
        NULL
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Vacancy applications → notifications (club-only scope)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_vacancy_application_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vacancy_record RECORD;
BEGIN
  SELECT id, club_id, title INTO vacancy_record
  FROM public.vacancies
  WHERE id = NEW.vacancy_id;

  IF vacancy_record.club_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_notification(
      vacancy_record.club_id,
      NEW.player_id,
      'vacancy_application_received',
      NEW.id,
      jsonb_build_object(
        'application_id', NEW.id,
        'vacancy_id', NEW.vacancy_id,
        'vacancy_title', vacancy_record.title,
        'applicant_id', NEW.player_id,
        'application_status', NEW.status
      ),
      NULL
    );
  ELSIF TG_OP = 'UPDATE' THEN
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
