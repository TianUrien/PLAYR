-- ============================================================================
-- Email Intelligence Schema
-- ============================================================================
-- Creates the core tables for the email intelligence system:
--   email_templates      – Admin-editable email templates
--   email_template_versions – Immutable version history for rollback
--   email_campaigns      – Campaign tracking (marketing + notification)
--   email_sends          – Per-recipient send log with Resend correlation
--   email_events         – Raw Resend webhook event log
-- ============================================================================

-- ============================================================================
-- 1. email_templates
-- ============================================================================

CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'notification'
    CHECK (category IN ('notification', 'marketing')),
  subject_template TEXT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_template TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  current_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_templates IS 'Admin-editable email templates with structured content blocks';
COMMENT ON COLUMN public.email_templates.template_key IS 'Stable identifier used by Edge Functions to look up templates';
COMMENT ON COLUMN public.email_templates.content_json IS 'Ordered array of content blocks (heading, paragraph, card, button, etc.)';
COMMENT ON COLUMN public.email_templates.variables IS 'Array of {name, description, required} defining available personalization variables';
COMMENT ON COLUMN public.email_templates.current_version IS 'Latest active version number';

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. email_template_versions
-- ============================================================================

CREATE TABLE public.email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.email_templates(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  subject_template TEXT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_template TEXT,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, version_number)
);

COMMENT ON TABLE public.email_template_versions IS 'Immutable version history for email templates, supports rollback';

-- ============================================================================
-- 3. email_campaigns
-- ============================================================================

CREATE TABLE public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  template_key TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'notification'
    CHECK (category IN ('notification', 'marketing')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  audience_filter JSONB,
  target_role TEXT,
  target_country TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_campaigns IS 'Campaign records for both marketing sends and notification batches';
COMMENT ON COLUMN public.email_campaigns.audience_filter IS 'JSON filter: {role, country_id, etc.} for targeted sends';

CREATE TRIGGER set_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. email_sends
-- ============================================================================

CREATE TABLE public.email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id TEXT,
  template_key TEXT NOT NULL,
  campaign_id UUID REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_role TEXT,
  recipient_country TEXT,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed', 'failed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_sends IS 'Per-recipient send log capturing role and country at send time for historical analytics';
COMMENT ON COLUMN public.email_sends.resend_email_id IS 'Resend API email ID for webhook event correlation';
COMMENT ON COLUMN public.email_sends.recipient_role IS 'User role captured at send time (not a FK - historical snapshot)';
COMMENT ON COLUMN public.email_sends.recipient_country IS 'User country captured at send time (not a FK - historical snapshot)';

-- ============================================================================
-- 5. email_events
-- ============================================================================

CREATE TABLE public.email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id UUID REFERENCES public.email_sends(id) ON DELETE SET NULL,
  resend_email_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('delivered', 'opened', 'clicked', 'bounced', 'complained', 'unsubscribed')),
  url TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_events IS 'Raw Resend webhook events for detailed analytics';
COMMENT ON COLUMN public.email_events.url IS 'Clicked URL (only for click events)';

-- ============================================================================
-- 6. Indexes
-- ============================================================================

-- email_templates
CREATE INDEX idx_email_templates_key ON public.email_templates(template_key);
CREATE INDEX idx_email_templates_category ON public.email_templates(category);

-- email_template_versions
CREATE INDEX idx_email_template_versions_template_id ON public.email_template_versions(template_id);

-- email_campaigns
CREATE INDEX idx_email_campaigns_status ON public.email_campaigns(status);
CREATE INDEX idx_email_campaigns_category ON public.email_campaigns(category);
CREATE INDEX idx_email_campaigns_sent_at ON public.email_campaigns(sent_at DESC NULLS LAST);

-- email_sends
CREATE INDEX idx_email_sends_resend_email_id ON public.email_sends(resend_email_id);
CREATE INDEX idx_email_sends_template_key ON public.email_sends(template_key);
CREATE INDEX idx_email_sends_campaign_id ON public.email_sends(campaign_id);
CREATE INDEX idx_email_sends_recipient_id ON public.email_sends(recipient_id);
CREATE INDEX idx_email_sends_sent_at ON public.email_sends(sent_at DESC);
CREATE INDEX idx_email_sends_status ON public.email_sends(status);
CREATE INDEX idx_email_sends_recipient_role ON public.email_sends(recipient_role);
CREATE INDEX idx_email_sends_recipient_country ON public.email_sends(recipient_country);

-- email_events
CREATE INDEX idx_email_events_resend_email_id ON public.email_events(resend_email_id);
CREATE INDEX idx_email_events_send_id ON public.email_events(send_id);
CREATE INDEX idx_email_events_event_type ON public.email_events(event_type);
CREATE INDEX idx_email_events_occurred_at ON public.email_events(occurred_at DESC);

-- ============================================================================
-- 7. Row Level Security
-- ============================================================================

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for all email intelligence tables
CREATE POLICY "Admins can manage email_templates"
  ON public.email_templates FOR ALL
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage email_template_versions"
  ON public.email_template_versions FOR ALL
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage email_campaigns"
  ON public.email_campaigns FOR ALL
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage email_sends"
  ON public.email_sends FOR ALL
  USING (public.is_platform_admin());

CREATE POLICY "Admins can manage email_events"
  ON public.email_events FOR ALL
  USING (public.is_platform_admin());
