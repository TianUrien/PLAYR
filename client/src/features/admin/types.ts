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
    passport1_country_id: number | null
    passport2_country_id: number | null
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
