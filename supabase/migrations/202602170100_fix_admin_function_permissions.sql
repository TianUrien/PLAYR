-- ============================================================================
-- FIX: Restore authenticated EXECUTE on admin functions
-- ============================================================================
-- The brand analytics migration (202602060500) accidentally revoked
-- EXECUTE from `authenticated` on admin_get_dashboard_stats and
-- admin_get_signup_trends, and never granted it for the new brand
-- analytics functions. This broke the Admin Portal Overview and
-- Brand Analytics pages (403 / "permission denied").
--
-- All admin functions already verify admin status internally via
-- is_platform_admin(), so granting EXECUTE to `authenticated` is safe.
-- ============================================================================

-- Dashboard stats (broken by 202602060500 lines 294-296)
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;

-- Signup trends (broken by 202602060500 lines 299-301)
GRANT EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) TO authenticated;

-- Brand activity (new in 202602060500, never granted to authenticated)
GRANT EXECUTE ON FUNCTION public.admin_get_brand_activity(integer, integer, integer) TO authenticated;

-- Brand summary (new in 202602060500, never granted to authenticated)
GRANT EXECUTE ON FUNCTION public.admin_get_brand_summary() TO authenticated;
