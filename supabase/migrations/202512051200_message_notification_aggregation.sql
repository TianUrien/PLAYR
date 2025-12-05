-- ============================================================================
-- Message Notification Aggregation
-- ============================================================================
-- This migration changes message notifications to aggregate by conversation
-- instead of creating a new notification for every message.
-- 
-- Benefits:
-- - Reduces notification flooding for active conversations
-- - Improves client performance by reducing notification count
-- - Better UX: shows "5 new messages from John" instead of 5 separate notifications
-- ============================================================================

SET search_path = public;

-- Add message_count field to track aggregated messages
-- This is already in metadata jsonb, but we document the expected structure here
COMMENT ON COLUMN public.profile_notifications.metadata IS 
'For message_received: { conversation_id, message_count, last_message_id, sender_ids[] }';

-- ============================================================================
-- Updated message notification handler with aggregation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_message_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  other_exists boolean;
  existing_notification record;
  existing_count int;
  sender_ids jsonb;
BEGIN
  -- Get the recipient of this message
  SELECT CASE 
    WHEN c.participant_one_id = NEW.sender_id THEN c.participant_two_id 
    ELSE c.participant_one_id 
  END
  INTO recipient
  FROM public.conversations c
  WHERE c.id = NEW.conversation_id;

  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check for existing unread message notification for this conversation
  SELECT id, metadata 
  INTO existing_notification
  FROM public.profile_notifications
  WHERE recipient_profile_id = recipient
    AND kind = 'message_received'
    AND source_entity_id = NEW.conversation_id  -- Use conversation_id as source
    AND read_at IS NULL
    AND cleared_at IS NULL
  LIMIT 1;

  IF existing_notification IS NOT NULL THEN
    -- Aggregate: update existing notification with new message info
    existing_count := coalesce((existing_notification.metadata->>'message_count')::int, 1);
    sender_ids := coalesce(existing_notification.metadata->'sender_ids', '[]'::jsonb);
    
    -- Add sender to list if not already present
    IF NOT sender_ids ? NEW.sender_id::text THEN
      sender_ids := sender_ids || to_jsonb(NEW.sender_id::text);
    END IF;

    UPDATE public.profile_notifications
    SET 
      metadata = jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'last_message_id', NEW.id,
        'message_count', existing_count + 1,
        'sender_ids', sender_ids
      ),
      updated_at = timezone('utc', now()),
      -- Keep created_at unchanged to preserve original notification time
      actor_profile_id = NEW.sender_id  -- Update to latest sender
    WHERE id = existing_notification.id;
  ELSE
    -- Create new notification with conversation_id as source_entity_id
    PERFORM public.enqueue_notification(
      recipient,
      NEW.sender_id,
      'message_received',
      NEW.conversation_id,  -- Changed from NEW.id to NEW.conversation_id
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'last_message_id', NEW.id,
        'message_count', 1,
        'sender_ids', jsonb_build_array(NEW.sender_id::text)
      ),
      NULL
    );
  END IF;

  -- Check if this is the first message in the conversation
  SELECT EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id AND m.id <> NEW.id
  ) INTO other_exists;

  IF NOT other_exists THEN
    PERFORM public.enqueue_notification(
      recipient,
      NEW.sender_id,
      'conversation_started',
      NEW.conversation_id,
      jsonb_build_object(
        'conversation_id', NEW.conversation_id
      ),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

-- No need to recreate trigger, it's already attached to messages table
