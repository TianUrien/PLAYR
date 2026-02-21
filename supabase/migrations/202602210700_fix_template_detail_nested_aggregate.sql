-- =============================================================================
-- Fix: admin_get_email_template_detail nested aggregate error
--
-- The daily_trend subquery had jsonb_agg(... COUNT(...) ...) which is
-- nested aggregation — invalid in PostgreSQL. Fix: pre-aggregate counts
-- in a subquery, then jsonb_agg the results.
-- =============================================================================

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
          'date', dt.d,
          'sent', dt.sent_count,
          'opened', dt.opened_count
        ) ORDER BY dt.d
      ), '[]'::jsonb)
      FROM (
        SELECT
          d::date AS d,
          COUNT(s2.id) AS sent_count,
          COUNT(s2.id) FILTER (WHERE s2.status IN ('opened', 'clicked')) AS opened_count
        FROM generate_series((now() - interval '30 days')::date, now()::date, '1 day') d
        LEFT JOIN public.email_sends s2
          ON s2.sent_at::date = d::date
          AND s2.template_key = (v_template->>'template_key')
        GROUP BY d::date
      ) dt
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
