-- ============================================================================
-- ADMIN FUNCTION PERMISSIONS
-- ============================================================================
-- Grant execute permissions on admin functions to authenticated users.
-- The functions themselves verify admin status via is_platform_admin().
-- ============================================================================

-- Dashboard & Statistics
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_signup_trends(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_top_countries(INTEGER) TO authenticated;

-- Data Issues
GRANT EXECUTE ON FUNCTION public.admin_get_auth_orphans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_orphans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_broken_references() TO authenticated;

-- Profile Management
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_orphan_profile(UUID) TO authenticated;

-- Audit Logging
GRANT EXECUTE ON FUNCTION public.admin_get_audit_logs(TEXT, TEXT, UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_action(TEXT, TEXT, UUID, JSONB, JSONB, JSONB) TO authenticated;
