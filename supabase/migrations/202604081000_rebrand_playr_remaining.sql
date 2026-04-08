-- ============================================================================
-- Catch any remaining PLAYR references in email templates
-- ============================================================================
-- The original rebrand migration (202603190100) ran before some templates
-- were created or edited. This re-applies the same replacement.
-- ============================================================================

BEGIN;

-- 1. email_templates: subject, text, content_json
UPDATE public.email_templates
SET
  subject_template = REPLACE(REPLACE(REPLACE(subject_template, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com'),
  text_template    = REPLACE(REPLACE(REPLACE(text_template, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com'),
  content_json     = REPLACE(REPLACE(REPLACE(content_json::text, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com')::jsonb,
  updated_at       = now()
WHERE
  subject_template ILIKE '%playr%'
  OR text_template ILIKE '%playr%'
  OR content_json::text ILIKE '%playr%';

-- 2. email_template_versions
UPDATE public.email_template_versions
SET
  subject_template = REPLACE(REPLACE(REPLACE(subject_template, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com'),
  text_template    = REPLACE(REPLACE(REPLACE(text_template, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com'),
  content_json     = REPLACE(REPLACE(REPLACE(content_json::text, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com')::jsonb
WHERE
  subject_template ILIKE '%playr%'
  OR text_template ILIKE '%playr%'
  OR content_json::text ILIKE '%playr%';

-- 3. email_campaigns
UPDATE public.email_campaigns
SET
  name = REPLACE(REPLACE(REPLACE(name, 'PLAYR', 'HOCKIA'), 'Playr', 'HOCKIA'), 'oplayr.com', 'inhockia.com'),
  updated_at = now()
WHERE
  name ILIKE '%playr%';

COMMIT;
