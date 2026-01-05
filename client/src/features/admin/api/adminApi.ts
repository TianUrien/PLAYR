/**
 * Admin API Module
 * 
 * Functions for calling admin RPC endpoints and Edge Functions.
 * All functions require the caller to be an admin.
 * 
 * NOTE: Type assertions through `unknown` are used because the admin RPC functions
 * are not yet in the generated Supabase types. After running the migration and
 * regenerating types with `supabase gen types typescript`, these can be simplified.
 */

import { supabase, SUPABASE_URL } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import type {
  DashboardStats,
  SignupTrend,
  TopCountry,
  AuthOrphan,
  ProfileOrphan,
  BrokenReferences,
  AdminProfileListItem,
  AdminProfileDetails,
  AuditLogEntry,
  ProfileSearchParams,
  AuditLogSearchParams,
  EngagementSummary,
  UserEngagementItem,
  EngagementTrend,
  UserEngagementDetail,
  UserEngagementSearchParams,
} from '../types'

// Helper to call RPC functions that aren't in generated types yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>

/**
 * Check if the current user is a platform admin
 */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin')
  if (error) {
    logger.error('[ADMIN_API] Failed to check admin status:', error)
    return false
  }
  return data === true
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await adminRpc('admin_get_dashboard_stats')
  if (error) throw new Error(`Failed to get dashboard stats: ${error.message}`)
  return data as DashboardStats
}

/**
 * Get signup trends for charts
 */
export async function getSignupTrends(days: number = 30): Promise<SignupTrend[]> {
  const { data, error } = await adminRpc('admin_get_signup_trends', {
    p_days: days,
  })
  if (error) throw new Error(`Failed to get signup trends: ${error.message}`)
  return data as SignupTrend[]
}

/**
 * Get top countries by user count
 */
export async function getTopCountries(limit: number = 10): Promise<TopCountry[]> {
  const { data, error } = await adminRpc('admin_get_top_countries', {
    p_limit: limit,
  })
  if (error) throw new Error(`Failed to get top countries: ${error.message}`)
  return data as TopCountry[]
}

/**
 * Get auth users without profiles (orphans)
 */
export async function getAuthOrphans(): Promise<AuthOrphan[]> {
  const { data, error } = await adminRpc('admin_get_auth_orphans')
  if (error) throw new Error(`Failed to get auth orphans: ${error.message}`)
  return data as AuthOrphan[]
}

/**
 * Get profiles without auth users (orphans)
 */
export async function getProfileOrphans(): Promise<ProfileOrphan[]> {
  const { data, error } = await adminRpc('admin_get_profile_orphans')
  if (error) throw new Error(`Failed to get profile orphans: ${error.message}`)
  return data as ProfileOrphan[]
}

/**
 * Get broken references in the database
 */
export async function getBrokenReferences(): Promise<BrokenReferences> {
  const { data, error } = await adminRpc('admin_get_broken_references')
  if (error) throw new Error(`Failed to get broken references: ${error.message}`)
  return data as BrokenReferences
}

/**
 * Search profiles with filters
 */
export async function searchProfiles(params: ProfileSearchParams): Promise<{
  profiles: AdminProfileListItem[]
  totalCount: number
}> {
  const { data, error } = await adminRpc('admin_search_profiles', {
    p_query: params.query || null,
    p_role: params.role || null,
    p_is_blocked: params.is_blocked ?? null,
    p_is_test_account: params.is_test_account ?? null,
    p_onboarding_completed: params.onboarding_completed ?? null,
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
  })
  if (error) throw new Error(`Failed to search profiles: ${error.message}`)
  
  const profiles = data as AdminProfileListItem[]
  const totalCount = profiles.length > 0 ? profiles[0].total_count : 0
  
  return { profiles, totalCount }
}

/**
 * Get full profile details for admin view
 */
export async function getProfileDetails(profileId: string): Promise<AdminProfileDetails> {
  const { data, error } = await adminRpc('admin_get_profile_details', {
    p_profile_id: profileId,
  })
  if (error) throw new Error(`Failed to get profile details: ${error.message}`)
  return data as AdminProfileDetails
}

/**
 * Block a user
 */
export async function blockUser(profileId: string, reason?: string): Promise<void> {
  const { error } = await adminRpc('admin_block_user', {
    p_profile_id: profileId,
    p_reason: reason || null,
  })
  if (error) throw new Error(`Failed to block user: ${error.message}`)
}

/**
 * Unblock a user
 */
export async function unblockUser(profileId: string): Promise<void> {
  const { error } = await adminRpc('admin_unblock_user', {
    p_profile_id: profileId,
  })
  if (error) throw new Error(`Failed to unblock user: ${error.message}`)
}

/**
 * Update profile fields
 */
export async function updateProfile(
  profileId: string,
  updates: Record<string, unknown>,
  reason?: string
): Promise<void> {
  const { error } = await adminRpc('admin_update_profile', {
    p_profile_id: profileId,
    p_updates: updates,
    p_reason: reason || null,
  })
  if (error) throw new Error(`Failed to update profile: ${error.message}`)
}

/**
 * Set test account status
 */
export async function setTestAccount(profileId: string, isTest: boolean): Promise<void> {
  const { error } = await adminRpc('admin_set_test_account', {
    p_profile_id: profileId,
    p_is_test: isTest,
  })
  if (error) throw new Error(`Failed to set test account status: ${error.message}`)
}

/**
 * Delete orphan profile (profile without auth user)
 */
export async function deleteOrphanProfile(profileId: string): Promise<void> {
  const { error } = await adminRpc('admin_delete_orphan_profile', {
    p_profile_id: profileId,
  })
  if (error) throw new Error(`Failed to delete orphan profile: ${error.message}`)
}

/**
 * Get audit logs with pagination
 */
export async function getAuditLogs(params: AuditLogSearchParams): Promise<{
  logs: AuditLogEntry[]
  totalCount: number
}> {
  const { data, error } = await adminRpc('admin_get_audit_logs', {
    p_action: params.action || null,
    p_target_type: params.target_type || null,
    p_admin_id: params.admin_id || null,
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
  })
  if (error) throw new Error(`Failed to get audit logs: ${error.message}`)
  
  const logs = data as AuditLogEntry[]
  const totalCount = logs.length > 0 ? logs[0].total_count : 0
  
  return { logs, totalCount }
}

/**
 * Delete auth user (requires Edge Function with service role)
 */
export async function deleteAuthUser(userId: string, reason?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No active session')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: 'delete_auth_user',
      target_id: userId,
      params: { reason },
    }),
  })

  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'Failed to delete auth user')
  }
}

/**
 * Set admin status for a user (requires Edge Function with service role)
 */
export async function setAdminStatus(userId: string, isAdmin: boolean, reason?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No active session')

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      action: 'set_admin_status',
      target_id: userId,
      params: { is_admin: isAdmin, reason },
    }),
  })

  const result = await response.json()
  if (!result.success) {
    throw new Error(result.error || 'Failed to set admin status')
  }
}

// ============================================================================
// VACANCY ANALYTICS
// ============================================================================

import type {
  VacancyListItem,
  VacancyApplicant,
  VacancyDetail,
  ClubActivity,
  ClubSummary,
  PlayerFunnel,
  ProfileCompletenessDistribution,
  ExtendedDashboardStats,
  VacancySearchParams,
} from '../types'

/**
 * Get paginated vacancy list with application statistics
 */
export async function getVacancies(params: VacancySearchParams = {}): Promise<{
  vacancies: VacancyListItem[]
  totalCount: number
}> {
  const { data, error } = await adminRpc('admin_get_vacancies', {
    p_status: params.status || null,
    p_club_id: params.club_id || null,
    p_days: params.days || null,
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
  })
  if (error) throw new Error(`Failed to get vacancies: ${error.message}`)
  
  const vacancies = data as VacancyListItem[]
  const totalCount = vacancies.length > 0 ? vacancies[0].total_count : 0
  
  return { vacancies, totalCount }
}

/**
 * Get applicants for a specific vacancy
 */
export async function getVacancyApplicants(
  vacancyId: string,
  status?: string,
  limit = 100,
  offset = 0
): Promise<{
  applicants: VacancyApplicant[]
  totalCount: number
}> {
  const { data, error } = await adminRpc('admin_get_vacancy_applicants', {
    p_vacancy_id: vacancyId,
    p_status: status || null,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(`Failed to get vacancy applicants: ${error.message}`)
  
  const applicants = data as VacancyApplicant[]
  const totalCount = applicants.length > 0 ? applicants[0].total_count : 0
  
  return { applicants, totalCount }
}

/**
 * Get full vacancy details with club info and application stats
 */
export async function getVacancyDetail(vacancyId: string): Promise<VacancyDetail> {
  const { data, error } = await adminRpc('admin_get_vacancy_detail', {
    p_vacancy_id: vacancyId,
  })
  if (error) throw new Error(`Failed to get vacancy detail: ${error.message}`)
  return data as VacancyDetail
}

// ============================================================================
// CLUB ANALYTICS
// ============================================================================

/**
 * Get club posting activity with vacancy and application stats
 */
export async function getClubActivity(
  days = 30,
  limit = 20,
  offset = 0
): Promise<{
  clubs: ClubActivity[]
  totalCount: number
}> {
  const { data, error } = await adminRpc('admin_get_club_activity', {
    p_days: days,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error(`Failed to get club activity: ${error.message}`)
  
  const clubs = data as ClubActivity[]
  const totalCount = clubs.length > 0 ? clubs[0].total_count : 0
  
  return { clubs, totalCount }
}

/**
 * Get club summary statistics
 */
export async function getClubSummary(): Promise<ClubSummary> {
  const { data, error } = await adminRpc('admin_get_club_summary')
  if (error) throw new Error(`Failed to get club summary: ${error.message}`)
  return data as ClubSummary
}

// ============================================================================
// PLAYER ANALYTICS
// ============================================================================

/**
 * Get player journey funnel metrics
 */
export async function getPlayerFunnel(days?: number): Promise<PlayerFunnel> {
  const { data, error } = await adminRpc('admin_get_player_funnel', {
    p_days: days || null,
  })
  if (error) throw new Error(`Failed to get player funnel: ${error.message}`)
  return data as PlayerFunnel
}

/**
 * Get profile completeness distribution by role
 */
export async function getProfileCompletenessDistribution(
  role = 'player'
): Promise<ProfileCompletenessDistribution[]> {
  const { data, error } = await adminRpc('admin_get_profile_completeness_distribution', {
    p_role: role,
  })
  if (error) throw new Error(`Failed to get profile completeness: ${error.message}`)
  return data as ProfileCompletenessDistribution[]
}

// ============================================================================
// EXTENDED DASHBOARD
// ============================================================================

/**
 * Get extended dashboard statistics with vacancy and player insights
 */
export async function getExtendedDashboardStats(): Promise<ExtendedDashboardStats> {
  const { data, error } = await adminRpc('admin_get_extended_dashboard_stats')
  if (error) throw new Error(`Failed to get extended stats: ${error.message}`)
  return data as ExtendedDashboardStats
}

// ============================================================================
// ENGAGEMENT TRACKING
// ============================================================================

/**
 * Get engagement summary statistics
 */
export async function getEngagementSummary(): Promise<EngagementSummary> {
  const { data, error } = await adminRpc('admin_get_engagement_summary')
  if (error) throw new Error(`Failed to get engagement summary: ${error.message}`)
  return data as EngagementSummary
}

/**
 * Get per-user engagement metrics
 */
export async function getUserEngagement(
  params: UserEngagementSearchParams = {}
): Promise<{ users: UserEngagementItem[]; totalCount: number }> {
  const { data, error } = await adminRpc('admin_get_user_engagement', {
    p_limit: params.limit || 50,
    p_offset: params.offset || 0,
    p_sort_by: params.sort_by || 'total_time',
    p_sort_dir: params.sort_dir || 'desc',
    p_days: params.days || 30,
  })
  if (error) throw new Error(`Failed to get user engagement: ${error.message}`)
  
  const users = data as UserEngagementItem[]
  const totalCount = users.length > 0 ? users[0].total_count : 0
  
  return { users, totalCount }
}

/**
 * Get engagement trends over time (for charts)
 */
export async function getEngagementTrends(days = 30): Promise<EngagementTrend[]> {
  const { data, error } = await adminRpc('admin_get_engagement_trends', {
    p_days: days,
  })
  if (error) throw new Error(`Failed to get engagement trends: ${error.message}`)
  return data as EngagementTrend[]
}

/**
 * Get detailed engagement data for a specific user
 */
export async function getUserEngagementDetail(
  userId: string,
  days = 90
): Promise<UserEngagementDetail> {
  const { data, error } = await adminRpc('admin_get_user_engagement_detail', {
    p_user_id: userId,
    p_days: days,
  })
  if (error) throw new Error(`Failed to get user engagement detail: ${error.message}`)
  return data as UserEngagementDetail
}
