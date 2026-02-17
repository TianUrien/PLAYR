-- ============================================================================
-- Campaign Management RPCs
-- ============================================================================
-- Adds 4 RPC functions for creating, previewing, and managing email campaigns:
--   admin_create_email_campaign      – Creates a draft campaign
--   admin_get_campaign_detail        – Campaign + aggregated send stats
--   admin_preview_campaign_audience  – Dry-run audience count + sample
--   admin_update_campaign_status     – Updates campaign status after send
-- ============================================================================

-- ============================================================================
-- 1. admin_create_email_campaign
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_create_email_campaign(
  p_name TEXT,
  p_template_id UUID,
  p_category TEXT DEFAULT 'notification',
  p_audience_filter JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_template_key TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Look up template_key from template_id
  SELECT template_key INTO v_template_key
  FROM public.email_templates
  WHERE id = p_template_id;

  IF v_template_key IS NULL THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  INSERT INTO public.email_campaigns (
    template_id,
    template_key,
    name,
    category,
    status,
    audience_filter,
    target_role,
    target_country,
    created_by
  ) VALUES (
    p_template_id,
    v_template_key,
    p_name,
    p_category,
    'draft',
    p_audience_filter,
    p_audience_filter->>'role',
    p_audience_filter->>'country',
    auth.uid()
  )
  RETURNING * INTO v_campaign;

  RETURN jsonb_build_object(
    'id', v_campaign.id,
    'template_id', v_campaign.template_id,
    'template_key', v_campaign.template_key,
    'name', v_campaign.name,
    'category', v_campaign.category,
    'status', v_campaign.status,
    'audience_filter', v_campaign.audience_filter,
    'target_role', v_campaign.target_role,
    'target_country', v_campaign.target_country,
    'created_at', v_campaign.created_at
  );
END;
$$;

-- ============================================================================
-- 2. admin_get_campaign_detail
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_campaign_detail(
  p_campaign_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id,
      'template_id', c.template_id,
      'template_key', c.template_key,
      'template_name', t.name,
      'name', c.name,
      'category', c.category,
      'status', c.status,
      'audience_filter', c.audience_filter,
      'target_role', c.target_role,
      'target_country', c.target_country,
      'scheduled_at', c.scheduled_at,
      'sent_at', c.sent_at,
      'total_recipients', c.total_recipients,
      'created_by', c.created_by,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ),
    'stats', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id),
      'delivered', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status IN ('delivered', 'opened', 'clicked')),
      'opened', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status IN ('opened', 'clicked')),
      'clicked', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status = 'clicked'),
      'bounced', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status = 'bounced')
    )
  ) INTO v_result
  FROM public.email_campaigns c
  LEFT JOIN public.email_templates t ON t.id = c.template_id
  WHERE c.id = p_campaign_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. admin_preview_campaign_audience
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_preview_campaign_audience(
  p_category TEXT DEFAULT 'notification',
  p_audience_filter JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_country TEXT;
  v_count BIGINT;
  v_sample JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_role := p_audience_filter->>'role';
  v_country := p_audience_filter->>'country';

  -- Count matching recipients
  SELECT COUNT(*) INTO v_count
  FROM public.profiles p
  LEFT JOIN public.countries c ON c.id = p.nationality_country_id
  WHERE p.email IS NOT NULL
    AND p.email <> ''
    AND p.is_blocked = false
    AND p.is_test_account = false
    AND (v_role IS NULL OR p.role = v_role)
    AND (v_country IS NULL OR c.code = v_country);

  -- Get sample of 10
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) INTO v_sample
  FROM (
    SELECT jsonb_build_object(
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'country_name', c.name
    ) AS row_data
    FROM public.profiles p
    LEFT JOIN public.countries c ON c.id = p.nationality_country_id
    WHERE p.email IS NOT NULL
      AND p.email <> ''
      AND p.is_blocked = false
      AND p.is_test_account = false
      AND (v_role IS NULL OR p.role = v_role)
      AND (v_country IS NULL OR c.code = v_country)
    ORDER BY p.created_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'count', v_count,
    'sample', v_sample
  );
END;
$$;

-- ============================================================================
-- 4. admin_update_campaign_status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_campaign_status(
  p_campaign_id UUID,
  p_status TEXT,
  p_sent_count INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_status NOT IN ('draft', 'sending', 'sent', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  UPDATE public.email_campaigns
  SET status = p_status,
      total_recipients = CASE WHEN p_sent_count > 0 THEN p_sent_count ELSE total_recipients END,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_campaign_id;
END;
$$;
