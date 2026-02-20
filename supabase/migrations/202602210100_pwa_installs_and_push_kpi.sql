-- =============================================================================
-- PWA Install Tracking + Push & PWA Admin KPIs
--
--   1. pwa_installs table — tracks PWA installations per user per platform
--   2. RLS policies — users manage own rows, admins read all
--   3. Extend admin_get_dashboard_stats() with push & PWA metrics
-- =============================================================================

-- 1. PWA Installs table
CREATE TABLE IF NOT EXISTS pwa_installs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'desktop')),
  user_agent TEXT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_pwa_installs_profile ON pwa_installs(profile_id);

-- 2. RLS
ALTER TABLE pwa_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users track own PWA installs"
  ON pwa_installs FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users read own PWA installs"
  ON pwa_installs FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Admins read all PWA installs"
  ON pwa_installs FOR SELECT
  USING (public.is_platform_admin());

-- 3. Extend admin_get_dashboard_stats with push & PWA metrics
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT json_build_object(
    -- User metrics (preserved from 202602060500)
    'total_users', (SELECT COUNT(*) FROM profiles WHERE NOT is_test_account),
    'total_players', (SELECT COUNT(*) FROM profiles WHERE role = 'player' AND NOT is_test_account),
    'total_coaches', (SELECT COUNT(*) FROM profiles WHERE role = 'coach' AND NOT is_test_account),
    'total_clubs', (SELECT COUNT(*) FROM profiles WHERE role = 'club' AND NOT is_test_account),
    'blocked_users', (SELECT COUNT(*) FROM profiles WHERE is_blocked = true),
    'test_accounts', (SELECT COUNT(*) FROM profiles WHERE is_test_account = true),

    -- Brand metrics (preserved from 202602060500)
    'total_brands', (SELECT COUNT(*) FROM brands WHERE deleted_at IS NULL),
    'brands_7d', (SELECT COUNT(*) FROM brands WHERE created_at > now() - interval '7 days' AND deleted_at IS NULL),
    'total_brand_products', (SELECT COUNT(*) FROM brand_products WHERE deleted_at IS NULL),
    'total_brand_posts', (SELECT COUNT(*) FROM brand_posts WHERE deleted_at IS NULL),

    -- Signups
    'signups_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '7 days' AND NOT is_test_account),
    'signups_30d', (SELECT COUNT(*) FROM profiles WHERE created_at > now() - interval '30 days' AND NOT is_test_account),

    -- Onboarding
    'onboarding_completed', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = true AND NOT is_test_account),
    'onboarding_pending', (SELECT COUNT(*) FROM profiles WHERE onboarding_completed = false AND NOT is_test_account),

    -- Content metrics
    'total_vacancies', (SELECT COUNT(*) FROM opportunities),
    'open_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'open'),
    'closed_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'closed'),
    'draft_vacancies', (SELECT COUNT(*) FROM opportunities WHERE status = 'draft'),
    'vacancies_7d', (SELECT COUNT(*) FROM opportunities WHERE created_at > now() - interval '7 days'),

    -- Applications
    'total_applications', (SELECT COUNT(*) FROM opportunity_applications),
    'pending_applications', (SELECT COUNT(*) FROM opportunity_applications WHERE status = 'pending'),
    'applications_7d', (SELECT COUNT(*) FROM opportunity_applications WHERE applied_at > now() - interval '7 days'),

    -- Engagement
    'total_conversations', (SELECT COUNT(*) FROM conversations),
    'total_messages', (SELECT COUNT(*) FROM messages),
    'messages_7d', (SELECT COUNT(*) FROM messages WHERE sent_at > now() - interval '7 days'),
    'total_friendships', (SELECT COUNT(*) FROM profile_friendships WHERE status = 'accepted'),

    -- Data health
    'auth_orphans', (
      SELECT COUNT(*)
      FROM auth.users au
      LEFT JOIN profiles p ON p.id = au.id
      WHERE p.id IS NULL
    ),
    'profile_orphans', (
      SELECT COUNT(*)
      FROM profiles p
      LEFT JOIN auth.users au ON au.id = p.id
      WHERE au.id IS NULL
    ),

    -- NEW: Push notification metrics
    'push_subscribers', (SELECT COUNT(DISTINCT profile_id) FROM push_subscriptions),
    'push_subscribers_player', (
      SELECT COUNT(DISTINCT ps.profile_id)
      FROM push_subscriptions ps
      JOIN profiles p ON p.id = ps.profile_id
      WHERE p.role = 'player' AND NOT p.is_test_account
    ),
    'push_subscribers_coach', (
      SELECT COUNT(DISTINCT ps.profile_id)
      FROM push_subscriptions ps
      JOIN profiles p ON p.id = ps.profile_id
      WHERE p.role = 'coach' AND NOT p.is_test_account
    ),
    'push_subscribers_club', (
      SELECT COUNT(DISTINCT ps.profile_id)
      FROM push_subscriptions ps
      JOIN profiles p ON p.id = ps.profile_id
      WHERE p.role = 'club' AND NOT p.is_test_account
    ),
    'push_subscribers_brand', (
      SELECT COUNT(DISTINCT ps.profile_id)
      FROM push_subscriptions ps
      JOIN profiles p ON p.id = ps.profile_id
      WHERE p.role = 'brand' AND NOT p.is_test_account
    ),

    -- NEW: PWA install metrics
    'pwa_installs', (SELECT COUNT(*) FROM pwa_installs),
    'pwa_installs_ios', (SELECT COUNT(*) FROM pwa_installs WHERE platform = 'ios'),
    'pwa_installs_android', (SELECT COUNT(*) FROM pwa_installs WHERE platform = 'android'),
    'pwa_installs_desktop', (SELECT COUNT(*) FROM pwa_installs WHERE platform = 'desktop'),

    -- Timestamps
    'generated_at', now()
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

-- Ensure authenticated can call (follows pattern from 202602170100)
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';
