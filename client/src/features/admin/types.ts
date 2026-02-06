/**
 * Admin Portal Types
 * 
 * Type definitions for admin-specific data structures and API responses.
 */

export interface DashboardStats {
  // User metrics
  total_users: number
  total_players: number
  total_coaches: number
  total_clubs: number
  blocked_users: number
  test_accounts: number
  
  // Signups
  signups_7d: number
  signups_30d: number
  
  // Onboarding
  onboarding_completed: number
  onboarding_pending: number
  
  // Content metrics
  total_vacancies: number
  open_vacancies: number
  closed_vacancies: number
  draft_vacancies: number
  vacancies_7d: number
  
  // Applications
  total_applications: number
  pending_applications: number
  applications_7d: number
  
  // Engagement
  total_conversations: number
  total_messages: number
  messages_7d: number
  total_friendships: number
  
  // Data health
  auth_orphans: number
  profile_orphans: number
  
  // Meta
  generated_at: string
}

export interface SignupTrend {
  date: string
  total_signups: number
  players: number
  coaches: number
  clubs: number
}

export interface TopCountry {
  country: string
  user_count: number
}

export interface AuthOrphan {
  user_id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  intended_role: string | null
}

export interface ProfileOrphan {
  profile_id: string
  email: string
  full_name: string | null
  role: string
  created_at: string
}

export interface BrokenReferences {
  applications_missing_player: Array<{
    application_id: string
    player_id: string
    vacancy_id: string
    created_at: string
  }> | null
  applications_missing_vacancy: Array<{
    application_id: string
    player_id: string
    vacancy_id: string
    created_at: string
  }> | null
  vacancies_missing_club: Array<{
    vacancy_id: string
    club_id: string
    title: string
    created_at: string
  }> | null
  messages_missing_sender: Array<{
    message_id: string
    sender_id: string
    conversation_id: string
    sent_at: string
  }> | null
  friendships_missing_users: Array<{
    friendship_id: string
    requester_id: string
    addressee_id: string
    missing: 'requester' | 'addressee' | 'both'
  }> | null
}

export interface AdminProfileListItem {
  id: string
  email: string
  full_name: string | null
  username: string | null
  role: string
  nationality: string | null
  nationality2: string | null
  base_location: string | null
  is_blocked: boolean
  is_test_account: boolean
  onboarding_completed: boolean
  created_at: string
  updated_at: string
  avatar_url: string | null
  total_count: number
}

export interface AdminProfileDetails {
  profile: {
    id: string
    email: string
    full_name: string | null
    username: string | null
    role: string
    nationality: string | null
    nationality_country_id: number | null
    nationality2_country_id: number | null
    base_location: string | null
    bio: string | null
    club_bio: string | null
    position: string | null
    secondary_position: string | null
    gender: string | null
    date_of_birth: string | null
    avatar_url: string | null
    highlight_video_url: string | null
    current_club: string | null
    league_division: string | null
    is_blocked: boolean
    is_test_account: boolean
    onboarding_completed: boolean
    blocked_at: string | null
    blocked_reason: string | null
    blocked_by: string | null
    created_at: string
    updated_at: string
  }
  auth_user: {
    id: string
    email: string
    created_at: string
    last_sign_in_at: string | null
    email_confirmed_at: string | null
    phone: string | null
    is_sso_user: boolean
  } | null
  stats: {
    vacancies_count: number
    applications_count: number
    messages_sent: number
    conversations_count: number
    friends_count: number
    gallery_photos_count: number
    playing_history_count: number
  }
}

export interface AuditLogEntry {
  id: string
  admin_id: string
  admin_email: string | null
  admin_name: string | null
  action: string
  target_type: string
  target_id: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
  total_count: number
}

export interface ProfileSearchParams {
  query?: string
  role?: 'player' | 'coach' | 'club'
  is_blocked?: boolean
  is_test_account?: boolean
  onboarding_completed?: boolean
  limit?: number
  offset?: number
}

export interface AuditLogSearchParams {
  action?: string
  target_type?: string
  admin_id?: string
  limit?: number
  offset?: number
}

export type AdminAction = 
  | 'block_user'
  | 'unblock_user'
  | 'update_profile'
  | 'delete_orphan_profile'
  | 'delete_auth_user'
  | 'mark_test_account'
  | 'unmark_test_account'
  | 'grant_admin'
  | 'revoke_admin'

// ============================================================================
// VACANCY ANALYTICS TYPES
// ============================================================================

export interface VacancyListItem {
  id: string
  title: string
  club_id: string
  club_name: string | null
  club_avatar_url: string | null
  status: 'draft' | 'open' | 'closed'
  opportunity_type: 'player' | 'coach'
  position: string | null
  location_city: string | null
  location_country: string | null
  application_count: number
  pending_count: number
  shortlisted_count: number
  first_application_at: string | null
  time_to_first_app_minutes: number | null
  created_at: string
  published_at: string | null
  application_deadline: string | null
  total_count: number
}

export interface VacancyApplicant {
  application_id: string
  player_id: string
  player_name: string | null
  player_email: string
  nationality: string | null
  position: string | null
  avatar_url: string | null
  highlight_video_url: string | null
  status: ApplicationStatus
  applied_at: string
  cover_letter: string | null
  onboarding_completed: boolean
  total_count: number
}

export type ApplicationStatus = 
  | 'pending'
  | 'reviewed'
  | 'shortlisted'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'withdrawn'

export interface VacancyDetail {
  vacancy: {
    id: string
    club_id: string
    opportunity_type: 'player' | 'coach'
    title: string
    position: string | null
    gender: string | null
    description: string | null
    location_city: string
    location_country: string
    start_date: string | null
    duration_text: string | null
    requirements: string[]
    benefits: string[]
    custom_benefits: string[]
    priority: 'low' | 'medium' | 'high'
    status: 'draft' | 'open' | 'closed'
    application_deadline: string | null
    contact_email: string | null
    contact_phone: string | null
    published_at: string | null
    closed_at: string | null
    created_at: string
    updated_at: string
  }
  club: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
    base_location: string | null
  }
  stats: {
    total_applications: number
    pending: number
    reviewed: number
    shortlisted: number
    interview: number
    accepted: number
    rejected: number
    withdrawn: number
    first_application_at: string | null
    last_application_at: string | null
    avg_apps_per_day: number | null
  }
}

export interface VacancySearchParams {
  status?: 'draft' | 'open' | 'closed'
  club_id?: string
  days?: number
  limit?: number
  offset?: number
}

// ============================================================================
// CLUB ANALYTICS TYPES
// ============================================================================

export interface ClubActivity {
  club_id: string
  club_name: string | null
  avatar_url: string | null
  base_location: string | null
  vacancy_count: number
  open_vacancy_count: number
  total_applications: number
  avg_apps_per_vacancy: number | null
  last_posted_at: string | null
  onboarding_completed: boolean
  total_count: number
}

export interface ClubSummary {
  total_clubs: number
  clubs_with_vacancies: number
  active_clubs_7d: number
  active_clubs_30d: number
  active_clubs_90d: number
  clubs_onboarded: number
  avg_vacancies_per_active_club: number | null
}

// ============================================================================
// PLAYER ANALYTICS TYPES
// ============================================================================

export interface PlayerFunnel {
  signed_up: number
  onboarding_completed: number
  has_avatar: number
  has_video: number
  has_journey_entry: number
  has_gallery_photo: number
  applied_to_vacancy: number
  open_to_opportunities: number
}

export interface ProfileCompletenessDistribution {
  bucket: string
  count: number
  percentage: number
}

// ============================================================================
// EXTENDED DASHBOARD TYPES
// ============================================================================

export interface ExtendedDashboardStats {
  // Vacancy performance
  vacancies_7d: number
  vacancies_30d: number
  avg_apps_per_vacancy: number | null
  active_clubs_7d: number
  active_clubs_30d: number
  vacancy_fill_rate: number | null
  
  // Player insights
  players_with_video: number
  players_with_video_pct: number | null
  players_applied_ever: number
  players_applied_7d: number
  avg_profile_score: number | null
  onboarding_rate: number | null
  
  // Application status breakdown
  application_status_breakdown: {
    pending: number
    reviewed: number
    shortlisted: number
    interview: number
    accepted: number
    rejected: number
    withdrawn: number
  }
  
  generated_at: string
}

// ============================================================================
// ENGAGEMENT TRACKING TYPES
// ============================================================================

export interface EngagementSummary {
  total_active_users_7d: number
  total_active_users_30d: number
  total_time_minutes_7d: number
  total_time_minutes_30d: number
  total_sessions_7d: number
  total_sessions_30d: number
  avg_session_minutes: number
  avg_daily_active_users: number
  generated_at: string
}

export interface UserEngagementItem {
  user_id: string
  display_name: string
  email: string
  role: string
  avatar_url: string | null
  total_time_minutes: number
  active_days: number
  total_sessions: number
  last_active_at: string | null
  avg_session_minutes: number
  total_count: number
}

export interface EngagementTrend {
  date: string
  active_users: number
  total_minutes: number
  total_sessions: number
}

export interface UserEngagementDetail {
  user_id: string
  summary: {
    total_time_minutes: number
    active_days: number
    total_sessions: number
    first_active: string | null
    last_active: string | null
    avg_daily_minutes: number
  }
  daily_breakdown: Array<{
    date: string
    minutes: number
    sessions: number
  }>
  recent_sessions: Array<{
    session_id: string
    started_at: string
    last_heartbeat: string
    duration_minutes: number
    heartbeat_count: number
  }>
}

export interface UserEngagementSearchParams {
  limit?: number
  offset?: number
  sort_by?: 'total_time' | 'active_days' | 'sessions' | 'last_active'
  sort_dir?: 'asc' | 'desc'
  days?: number
}

// ============================================================================
// Hockey World Types
// ============================================================================

export interface WorldClub {
  id: string
  club_id: string
  club_name: string
  club_name_normalized: string
  country_id: number
  country_name?: string
  country_code?: string
  country_flag_emoji?: string | null
  province_id: number | null
  province_name?: string | null
  men_league_id: number | null
  men_league_name?: string | null
  women_league_id: number | null
  women_league_name?: string | null
  is_claimed: boolean
  claimed_profile_id: string | null
  claimed_profile_name?: string | null
  claimed_at: string | null
  created_from: 'seed' | 'user' | 'admin'
  created_at: string
  updated_at: string
}

export interface WorldClubStats {
  total_clubs: number
  claimed_clubs: number
  unclaimed_clubs: number
}

export interface WorldClubFilters {
  country_id?: number
  province_id?: number
  league_id?: number // matches either men or women league
  is_claimed?: boolean
  created_from?: 'seed' | 'user' | 'admin'
  search?: string
}

export interface WorldCountry {
  id: number
  code: string
  name: string
  flag_emoji: string | null
}

export interface WorldProvince {
  id: number
  country_id: number
  name: string
  slug: string
}

export interface WorldLeague {
  id: number
  name: string
  tier: number | null
  province_id: number | null
  country_id: number | null
}

export interface WorldClubCreatePayload {
  club_name: string
  country_id: number
  province_id?: number | null
  men_league_id?: number | null
  women_league_id?: number | null
}

export interface WorldClubUpdatePayload {
  club_name?: string
  country_id?: number
  province_id?: number | null
  men_league_id?: number | null
  women_league_id?: number | null
  is_claimed?: boolean
  claimed_profile_id?: string | null
}

// Admin-enriched league (with joined country/province names)
export interface WorldLeagueAdmin {
  id: number
  name: string
  slug: string | null
  tier: number | null
  logical_id: string | null
  display_order: number
  province_id: number | null
  province_name?: string | null
  country_id: number | null
  country_name?: string | null
  country_code?: string | null
  country_flag_emoji?: string | null
  created_at: string
  updated_at: string
}

export interface WorldLeagueFilters {
  country_id?: number
  province_id?: number
  search?: string
}

export interface WorldLeagueCreatePayload {
  name: string
  tier?: number | null
  country_id: number
  province_id?: number | null
  display_order?: number
}

export interface WorldLeagueUpdatePayload {
  name?: string
  tier?: number | null
  country_id?: number
  province_id?: number | null
  display_order?: number
}

// Admin-enriched region (with joined country name)
export interface WorldProvinceAdmin {
  id: number
  country_id: number
  country_name?: string
  country_code?: string
  country_flag_emoji?: string | null
  name: string
  slug: string
  logical_id: string | null
  description: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface WorldProvinceFilters {
  country_id?: number
  search?: string
}

export interface WorldProvinceCreatePayload {
  name: string
  country_id: number
  description?: string | null
  display_order?: number
}

export interface WorldProvinceUpdatePayload {
  name?: string
  country_id?: number
  description?: string | null
  display_order?: number
}

// ============================================================================
// INVESTOR DASHBOARD TYPES
// ============================================================================

export interface InvestorMetrics {
  // User totals
  total_users: number
  total_players: number
  total_coaches: number
  total_clubs: number

  // Signups by period
  signups_7d: number
  signups_30d: number
  signups_90d: number

  // Growth rates (percentage vs previous period)
  growth_rate_7d: number
  growth_rate_30d: number

  // Geographic distribution
  top_countries: Array<{
    country: string
    user_count: number
  }>

  // Engagement signals
  dau_7d_avg: number
  total_messages_30d: number
  total_applications_30d: number
  total_opportunities: number

  // Metadata
  period_days: number
  generated_at: string
}

export interface InvestorSignupTrend {
  date: string
  total_signups: number
  cumulative_total: number
  players: number
  coaches: number
  clubs: number
}

export interface InvestorShareToken {
  id: string
  token: string
  name: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_accessed_at: string | null
  access_count: number
  is_active: boolean
}

