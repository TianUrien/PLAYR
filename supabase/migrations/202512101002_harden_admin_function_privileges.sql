-- ============================================================================
-- SECURITY HARDENING: Restrict Admin Function Execute Privileges
-- ============================================================================
-- This migration revokes EXECUTE privileges on admin_* functions from
-- anon and authenticated roles. These functions already check is_platform_admin()
-- internally, but restricting execute at the database level provides
-- defense-in-depth security.
--
-- Admin functions should only be callable via service_role (Edge Functions)
-- or by postgres directly.
-- ============================================================================

BEGIN;

SET search_path = public;

-- ============================================================================
-- Revoke public execute on all admin functions
-- ============================================================================

-- admin_get_dashboard_stats
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_stats() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO service_role;

-- admin_get_signup_trends
REVOKE EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_signup_trends(integer) TO service_role;

-- admin_get_top_countries
REVOKE EXECUTE ON FUNCTION public.admin_get_top_countries(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_top_countries(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_top_countries(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_top_countries(integer) TO service_role;

-- admin_search_profiles
REVOKE EXECUTE ON FUNCTION public.admin_search_profiles(text, text, boolean, boolean, boolean, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_profiles(text, text, boolean, boolean, boolean, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_search_profiles(text, text, boolean, boolean, boolean, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_profiles(text, text, boolean, boolean, boolean, integer, integer) TO service_role;

-- admin_get_profile_details
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_details(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_details(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_details(uuid) TO service_role;

-- admin_update_profile
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(uuid, jsonb, text) TO service_role;

-- admin_block_user
REVOKE EXECUTE ON FUNCTION public.admin_block_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_block_user(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_block_user(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_block_user(uuid, text) TO service_role;

-- admin_unblock_user
REVOKE EXECUTE ON FUNCTION public.admin_unblock_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_user(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unblock_user(uuid) TO service_role;

-- admin_get_auth_orphans
REVOKE EXECUTE ON FUNCTION public.admin_get_auth_orphans() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_auth_orphans() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_auth_orphans() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_auth_orphans() TO service_role;

-- admin_get_profile_orphans
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_orphans() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_orphans() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_profile_orphans() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_orphans() TO service_role;

-- admin_get_broken_references
REVOKE EXECUTE ON FUNCTION public.admin_get_broken_references() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_broken_references() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_broken_references() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_broken_references() TO service_role;

-- admin_delete_orphan_profile
REVOKE EXECUTE ON FUNCTION public.admin_delete_orphan_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_delete_orphan_profile(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_orphan_profile(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_orphan_profile(uuid) TO service_role;

-- admin_get_audit_logs
REVOKE EXECUTE ON FUNCTION public.admin_get_audit_logs(text, text, uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_audit_logs(text, text, uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_audit_logs(text, text, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_audit_logs(text, text, uuid, integer, integer) TO service_role;

-- admin_log_action
REVOKE EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_action(text, text, uuid, jsonb, jsonb, jsonb) TO service_role;

-- admin_set_test_account
REVOKE EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_test_account(uuid, boolean) TO service_role;

-- admin_resolve_country_mapping (from countries_normalization migration)
REVOKE EXECUTE ON FUNCTION public.admin_resolve_country_mapping(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_country_mapping(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_country_mapping(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_country_mapping(uuid, text, integer) TO service_role;

-- ============================================================================
-- Also restrict some sensitive internal functions
-- ============================================================================

-- find_zombie_accounts - should only be called by admins
REVOKE EXECUTE ON FUNCTION public.find_zombie_accounts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_zombie_accounts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_zombie_accounts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_zombie_accounts() TO service_role;

-- recover_zombie_accounts - should only be called by admins
REVOKE EXECUTE ON FUNCTION public.recover_zombie_accounts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recover_zombie_accounts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recover_zombie_accounts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recover_zombie_accounts() TO service_role;

-- hard_delete_profile_relations - dangerous function
REVOKE EXECUTE ON FUNCTION public.hard_delete_profile_relations(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hard_delete_profile_relations(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.hard_delete_profile_relations(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_profile_relations(uuid, integer) TO service_role;

-- delete_rows_where_clause - dangerous dynamic SQL function
REVOKE EXECUTE ON FUNCTION public.delete_rows_where_clause(regclass, text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_rows_where_clause(regclass, text, uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_rows_where_clause(regclass, text, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_rows_where_clause(regclass, text, uuid, integer) TO service_role;

-- enqueue_storage_objects_for_prefix - internal function
REVOKE EXECUTE ON FUNCTION public.enqueue_storage_objects_for_prefix(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_storage_objects_for_prefix(text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_storage_objects_for_prefix(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_storage_objects_for_prefix(text, text, text) TO service_role;

COMMIT;
