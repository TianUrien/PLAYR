-- ============================================================================
-- Email Intelligence — Analytics Views & Admin RPC Functions
-- ============================================================================

-- ============================================================================
-- 1. Aggregated template stats view
-- ============================================================================

CREATE OR REPLACE VIEW public.email_template_stats AS
SELECT
  t.id AS template_id,
  t.template_key,
  t.name,
  t.category,
  t.is_active,
  COUNT(s.id) AS total_sent,
  COUNT(s.id) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked')) AS total_delivered,
  COUNT(s.id) FILTER (WHERE s.status IN ('opened', 'clicked')) AS total_opened,
  COUNT(s.id) FILTER (WHERE s.status = 'clicked') AS total_clicked,
  COUNT(s.id) FILTER (WHERE s.status = 'bounced') AS total_bounced,
  COUNT(s.id) FILTER (WHERE s.status = 'complained') AS total_complained,
  COUNT(s.id) FILTER (WHERE s.status = 'unsubscribed') AS total_unsubscribed,
  CASE WHEN COUNT(s.id) > 0
    THEN ROUND(COUNT(s.id) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked'))::numeric / COUNT(s.id) * 100, 1)
    ELSE 0 END AS delivery_rate,
  CASE WHEN COUNT(s.id) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked')) > 0
    THEN ROUND(COUNT(s.id) FILTER (WHERE s.status IN ('opened', 'clicked'))::numeric /
         COUNT(s.id) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked')) * 100, 1)
    ELSE 0 END AS open_rate,
  CASE WHEN COUNT(s.id) FILTER (WHERE s.status IN ('opened', 'clicked')) > 0
    THEN ROUND(COUNT(s.id) FILTER (WHERE s.status = 'clicked')::numeric /
         COUNT(s.id) FILTER (WHERE s.status IN ('opened', 'clicked')) * 100, 1)
    ELSE 0 END AS click_rate
FROM public.email_templates t
LEFT JOIN public.email_sends s ON s.template_key = t.template_key
GROUP BY t.id, t.template_key, t.name, t.category, t.is_active;

ALTER VIEW public.email_template_stats SET (security_invoker = true);

-- ============================================================================
-- 2. admin_get_email_overview — KPI summary + daily trends
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_overview(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_cutoff TIMESTAMPTZ;
  v_total_sent BIGINT;
  v_total_delivered BIGINT;
  v_total_opened BIGINT;
  v_total_clicked BIGINT;
  v_total_bounced BIGINT;
  v_total_complained BIGINT;
  v_total_unsubscribed BIGINT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_cutoff := now() - (p_days || ' days')::interval;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')),
    COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')),
    COUNT(*) FILTER (WHERE status = 'clicked'),
    COUNT(*) FILTER (WHERE status = 'bounced'),
    COUNT(*) FILTER (WHERE status = 'complained'),
    COUNT(*) FILTER (WHERE status = 'unsubscribed')
  INTO v_total_sent, v_total_delivered, v_total_opened, v_total_clicked,
       v_total_bounced, v_total_complained, v_total_unsubscribed
  FROM public.email_sends
  WHERE sent_at >= v_cutoff;

  v_result := jsonb_build_object(
    'total_sent', v_total_sent,
    'total_delivered', v_total_delivered,
    'total_opened', v_total_opened,
    'total_clicked', v_total_clicked,
    'total_bounced', v_total_bounced,
    'total_complained', v_total_complained,
    'total_unsubscribed', v_total_unsubscribed,
    'delivery_rate', CASE WHEN v_total_sent > 0
      THEN ROUND(v_total_delivered::numeric / v_total_sent * 100, 1) ELSE 0 END,
    'open_rate', CASE WHEN v_total_delivered > 0
      THEN ROUND(v_total_opened::numeric / v_total_delivered * 100, 1) ELSE 0 END,
    'click_rate', CASE WHEN v_total_opened > 0
      THEN ROUND(v_total_clicked::numeric / v_total_opened * 100, 1) ELSE 0 END,
    'bounce_rate', CASE WHEN v_total_sent > 0
      THEN ROUND(v_total_bounced::numeric / v_total_sent * 100, 1) ELSE 0 END,
    'complaint_rate', CASE WHEN v_total_sent > 0
      THEN ROUND(v_total_complained::numeric / v_total_sent * 100, 1) ELSE 0 END,
    'unsubscribe_rate', CASE WHEN v_total_delivered > 0
      THEN ROUND(v_total_unsubscribed::numeric / v_total_delivered * 100, 1) ELSE 0 END,
    'daily_trend', (
      SELECT COALESCE(jsonb_agg(day_data ORDER BY day_data->>'date'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'date', d::date,
          'sent', COUNT(s.id),
          'delivered', COUNT(s.id) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked')),
          'opened', COUNT(s.id) FILTER (WHERE s.status IN ('opened', 'clicked')),
          'clicked', COUNT(s.id) FILTER (WHERE s.status = 'clicked'),
          'bounced', COUNT(s.id) FILTER (WHERE s.status = 'bounced')
        ) AS day_data
        FROM generate_series(v_cutoff::date, now()::date, '1 day') d
        LEFT JOIN public.email_sends s ON s.sent_at::date = d::date
        GROUP BY d
      ) sub
    ),
    'template_breakdown', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'template_key', template_key,
          'name', name,
          'sent', total_sent,
          'delivered', total_delivered,
          'opened', total_opened,
          'clicked', total_clicked,
          'open_rate', open_rate,
          'click_rate', click_rate
        )
      ), '[]'::jsonb)
      FROM public.email_template_stats
    ),
    'generated_at', now()
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. admin_get_email_templates — All templates with stats + latest version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_templates()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    FROM (
      SELECT jsonb_build_object(
        'id', t.id,
        'template_key', t.template_key,
        'name', t.name,
        'description', t.description,
        'category', t.category,
        'subject_template', t.subject_template,
        'content_json', t.content_json,
        'text_template', t.text_template,
        'variables', t.variables,
        'is_active', t.is_active,
        'current_version', t.current_version,
        'created_at', t.created_at,
        'updated_at', t.updated_at,
        'total_sent', COALESCE(s.total_sent, 0),
        'total_delivered', COALESCE(s.total_delivered, 0),
        'total_opened', COALESCE(s.total_opened, 0),
        'total_clicked', COALESCE(s.total_clicked, 0),
        'open_rate', COALESCE(s.open_rate, 0),
        'click_rate', COALESCE(s.click_rate, 0)
      ) AS row_data
      FROM public.email_templates t
      LEFT JOIN public.email_template_stats s ON s.template_id = t.id
      ORDER BY t.category, t.name
    ) sub
  );
END;
$$;

-- ============================================================================
-- 4. admin_get_email_template_detail — Template + versions + per-template stats
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_template_detail(
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template JSONB;
  v_versions JSONB;
  v_stats JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Template
  SELECT jsonb_build_object(
    'id', t.id,
    'template_key', t.template_key,
    'name', t.name,
    'description', t.description,
    'category', t.category,
    'subject_template', t.subject_template,
    'content_json', t.content_json,
    'text_template', t.text_template,
    'variables', t.variables,
    'is_active', t.is_active,
    'current_version', t.current_version,
    'created_at', t.created_at,
    'updated_at', t.updated_at
  ) INTO v_template
  FROM public.email_templates t
  WHERE t.id = p_template_id;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'Template not found: %', p_template_id;
  END IF;

  -- Versions
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', v.id,
      'version_number', v.version_number,
      'subject_template', v.subject_template,
      'content_json', v.content_json,
      'text_template', v.text_template,
      'variables', v.variables,
      'change_note', v.change_note,
      'created_by', v.created_by,
      'created_at', v.created_at
    ) ORDER BY v.version_number DESC
  ), '[]'::jsonb) INTO v_versions
  FROM public.email_template_versions v
  WHERE v.template_id = p_template_id;

  -- Per-template send stats (last 30 days)
  SELECT jsonb_build_object(
    'total_sent', COUNT(*),
    'total_delivered', COUNT(*) FILTER (WHERE s.status IN ('delivered', 'opened', 'clicked')),
    'total_opened', COUNT(*) FILTER (WHERE s.status IN ('opened', 'clicked')),
    'total_clicked', COUNT(*) FILTER (WHERE s.status = 'clicked'),
    'total_bounced', COUNT(*) FILTER (WHERE s.status = 'bounced'),
    'daily_trend', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'date', d::date,
          'sent', COUNT(s2.id),
          'opened', COUNT(s2.id) FILTER (WHERE s2.status IN ('opened', 'clicked'))
        ) ORDER BY d
      ), '[]'::jsonb)
      FROM generate_series((now() - interval '30 days')::date, now()::date, '1 day') d
      LEFT JOIN public.email_sends s2
        ON s2.sent_at::date = d::date
        AND s2.template_key = (v_template->>'template_key')
    ),
    'by_role', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'role', sr.recipient_role,
          'sent', sr.cnt,
          'opened', sr.opened_cnt
        )
      ), '[]'::jsonb)
      FROM (
        SELECT
          recipient_role,
          COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) AS opened_cnt
        FROM public.email_sends
        WHERE template_key = (v_template->>'template_key')
          AND sent_at >= now() - interval '30 days'
          AND recipient_role IS NOT NULL
        GROUP BY recipient_role
      ) sr
    ),
    'by_country', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'country', sc.recipient_country,
          'sent', sc.cnt,
          'opened', sc.opened_cnt
        )
      ), '[]'::jsonb)
      FROM (
        SELECT
          recipient_country,
          COUNT(*) AS cnt,
          COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')) AS opened_cnt
        FROM public.email_sends
        WHERE template_key = (v_template->>'template_key')
          AND sent_at >= now() - interval '30 days'
          AND recipient_country IS NOT NULL
        GROUP BY recipient_country
        ORDER BY cnt DESC
        LIMIT 20
      ) sc
    )
  ) INTO v_stats
  FROM public.email_sends s
  WHERE s.template_key = (v_template->>'template_key')
    AND s.sent_at >= now() - interval '30 days';

  RETURN jsonb_build_object(
    'template', v_template,
    'versions', v_versions,
    'stats', v_stats
  );
END;
$$;

-- ============================================================================
-- 5. admin_save_email_template_draft — Create new version
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_save_email_template_draft(
  p_template_id UUID,
  p_subject TEXT,
  p_content_json JSONB,
  p_text TEXT DEFAULT NULL,
  p_variables JSONB DEFAULT '[]'::jsonb,
  p_change_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version INT;
  v_version_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.email_template_versions
  WHERE template_id = p_template_id;

  -- Insert version row
  INSERT INTO public.email_template_versions (
    template_id, version_number, subject_template, content_json,
    text_template, variables, change_note, created_by
  )
  VALUES (
    p_template_id, v_next_version, p_subject, p_content_json,
    p_text, p_variables, p_change_note, auth.uid()
  )
  RETURNING id INTO v_version_id;

  RETURN jsonb_build_object(
    'version_id', v_version_id,
    'version_number', v_next_version
  );
END;
$$;

-- ============================================================================
-- 6. admin_activate_email_template — Copy version to main row + set active
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_activate_email_template(
  p_template_id UUID,
  p_version_number INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version RECORD;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT * INTO v_version
  FROM public.email_template_versions
  WHERE template_id = p_template_id AND version_number = p_version_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Version % not found for template %', p_version_number, p_template_id;
  END IF;

  UPDATE public.email_templates
  SET
    subject_template = v_version.subject_template,
    content_json = v_version.content_json,
    text_template = v_version.text_template,
    variables = v_version.variables,
    current_version = v_version.version_number,
    is_active = true,
    updated_at = now()
  WHERE id = p_template_id;
END;
$$;

-- ============================================================================
-- 7. admin_rollback_email_template — Same as activate (semantically distinct)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_rollback_email_template(
  p_template_id UUID,
  p_version_number INT
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

  PERFORM public.admin_activate_email_template(p_template_id, p_version_number);
END;
$$;

-- ============================================================================
-- 8. admin_get_email_campaigns — Paginated campaigns list
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_campaigns(
  p_status TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
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
    'updated_at', c.updated_at,
    'total_sent', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id),
    'total_delivered', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status IN ('delivered', 'opened', 'clicked')),
    'total_opened', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status IN ('opened', 'clicked')),
    'total_clicked', (SELECT COUNT(*) FROM public.email_sends s WHERE s.campaign_id = c.id AND s.status = 'clicked'),
    'total_count', COUNT(*) OVER()
  )
  FROM public.email_campaigns c
  LEFT JOIN public.email_templates t ON t.id = c.template_id
  WHERE (p_status IS NULL OR c.status = p_status)
    AND (p_category IS NULL OR c.category = p_category)
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 9. admin_get_email_send_stats — Filtered send aggregations
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_send_stats(
  p_days INT DEFAULT 30,
  p_template_key TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  v_cutoff := now() - (p_days || ' days')::interval;

  RETURN (
    SELECT jsonb_build_object(
      'total_sent', COUNT(*),
      'total_delivered', COUNT(*) FILTER (WHERE status IN ('delivered', 'opened', 'clicked')),
      'total_opened', COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')),
      'total_clicked', COUNT(*) FILTER (WHERE status = 'clicked'),
      'total_bounced', COUNT(*) FILTER (WHERE status = 'bounced'),
      'total_complained', COUNT(*) FILTER (WHERE status = 'complained'),
      'total_unsubscribed', COUNT(*) FILTER (WHERE status = 'unsubscribed'),
      'by_role', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'role', recipient_role,
          'sent', COUNT(*),
          'opened', COUNT(*) FILTER (WHERE status IN ('opened', 'clicked')),
          'clicked', COUNT(*) FILTER (WHERE status = 'clicked')
        )), '[]'::jsonb)
        FROM public.email_sends
        WHERE sent_at >= v_cutoff
          AND (p_template_key IS NULL OR template_key = p_template_key)
          AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
          AND recipient_role IS NOT NULL
        GROUP BY recipient_role
      ),
      'by_country', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'country', recipient_country,
          'sent', COUNT(*),
          'opened', COUNT(*) FILTER (WHERE status IN ('opened', 'clicked'))
        )), '[]'::jsonb)
        FROM public.email_sends
        WHERE sent_at >= v_cutoff
          AND (p_template_key IS NULL OR template_key = p_template_key)
          AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
          AND recipient_country IS NOT NULL
        GROUP BY recipient_country
        ORDER BY COUNT(*) DESC
        LIMIT 20
      )
    )
    FROM public.email_sends
    WHERE sent_at >= v_cutoff
      AND (p_template_key IS NULL OR template_key = p_template_key)
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
  );
END;
$$;

-- ============================================================================
-- 10. admin_get_user_email_history — Per-user email history
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_user_email_history(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', s.id,
    'template_key', s.template_key,
    'template_name', t.name,
    'campaign_id', s.campaign_id,
    'recipient_email', s.recipient_email,
    'recipient_role', s.recipient_role,
    'recipient_country', s.recipient_country,
    'subject', s.subject,
    'status', s.status,
    'sent_at', s.sent_at,
    'delivered_at', s.delivered_at,
    'opened_at', s.opened_at,
    'clicked_at', s.clicked_at,
    'bounced_at', s.bounced_at,
    'total_count', COUNT(*) OVER()
  )
  FROM public.email_sends s
  LEFT JOIN public.email_templates t ON t.template_key = s.template_key
  WHERE s.recipient_id = p_user_id
  ORDER BY s.sent_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 11. admin_get_email_engagement_explorer — User engagement explorer
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_email_engagement_explorer(
  p_template_key TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_role TEXT DEFAULT NULL,
  p_country TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS SETOF JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'send_id', s.id,
    'recipient_id', s.recipient_id,
    'recipient_email', s.recipient_email,
    'recipient_role', s.recipient_role,
    'recipient_country', s.recipient_country,
    'recipient_name', p.full_name,
    'template_key', s.template_key,
    'template_name', t.name,
    'subject', s.subject,
    'status', s.status,
    'engagement_state', CASE
      WHEN s.status = 'bounced' THEN 'bounced'
      WHEN s.status = 'complained' THEN 'complained'
      WHEN s.status = 'unsubscribed' THEN 'unsubscribed'
      WHEN s.status = 'clicked' THEN 'clicked'
      WHEN s.status IN ('opened') THEN 'opened_not_clicked'
      WHEN s.status = 'delivered' THEN 'delivered_not_opened'
      ELSE 'sent'
    END,
    'sent_at', s.sent_at,
    'delivered_at', s.delivered_at,
    'opened_at', s.opened_at,
    'clicked_at', s.clicked_at,
    'total_count', COUNT(*) OVER()
  )
  FROM public.email_sends s
  LEFT JOIN public.email_templates t ON t.template_key = s.template_key
  LEFT JOIN public.profiles p ON p.id = s.recipient_id
  WHERE (p_template_key IS NULL OR s.template_key = p_template_key)
    AND (p_campaign_id IS NULL OR s.campaign_id = p_campaign_id)
    AND (p_role IS NULL OR s.recipient_role = p_role)
    AND (p_country IS NULL OR s.recipient_country = p_country)
    AND (p_status IS NULL OR CASE
      WHEN p_status = 'delivered_not_opened' THEN s.status = 'delivered'
      WHEN p_status = 'opened_not_clicked' THEN s.status = 'opened'
      WHEN p_status = 'clicked' THEN s.status = 'clicked'
      WHEN p_status = 'bounced' THEN s.status = 'bounced'
      WHEN p_status = 'unsubscribed' THEN s.status = 'unsubscribed'
      ELSE TRUE
    END)
  ORDER BY s.sent_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
