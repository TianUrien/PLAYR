-- ============================================================================
-- Restore messages_notify trigger
-- ============================================================================
-- The trigger was dropped in 202511221030_notification_scope.sql:
--   DROP TRIGGER IF EXISTS messages_notify ON public.messages;
--   DROP FUNCTION IF EXISTS public.handle_message_notifications();
--
-- The function was recreated in 202512051200_message_notification_aggregation.sql
-- with aggregation support, but the trigger was NOT recreated (the migration
-- comment incorrectly assumed it still existed).
--
-- This restores the trigger so message notifications work again.
-- ============================================================================

DROP TRIGGER IF EXISTS messages_notify ON public.messages;
CREATE TRIGGER messages_notify
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_message_notifications();
