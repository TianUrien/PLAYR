-- ============================================================================
-- Fix campaign status RPC for service-role send flows
-- ============================================================================
-- Problem:
--   admin_send_campaign uses the service-role client when updating campaign
--   status during send execution. The existing RPC still enforced
--   is_platform_admin(), which depends on auth.uid() and fails under
--   service-role execution. The edge function was therefore able to send
--   emails successfully while silently leaving the campaign row in "draft".
--
-- Fix:
--   Allow the trusted service_role context to call this RPC, while preserving
--   the platform-admin check for normal authenticated callers.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_campaign_status(
  p_campaign_id UUID,
  p_status TEXT,
  p_sent_count INT DEFAULT 0,
  p_total_recipients INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_status NOT IN ('draft', 'sending', 'sent', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE public.email_campaigns
  SET status = p_status,
      total_recipients = COALESCE(p_total_recipients, total_recipients),
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_campaign_id;
END;
$$;

UPDATE public.email_campaigns c
SET status = CASE
      WHEN stats.total_sent > 0 THEN 'sent'
      ELSE c.status
    END,
    total_recipients = GREATEST(c.total_recipients, stats.total_sent),
    sent_at = COALESCE(c.sent_at, stats.first_sent_at)
FROM (
  SELECT
    campaign_id,
    COUNT(*)::INT AS total_sent,
    MIN(created_at) AS first_sent_at
  FROM public.email_sends
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id
) AS stats
WHERE c.id = stats.campaign_id
  AND c.status = 'draft'
  AND stats.total_sent > 0;
