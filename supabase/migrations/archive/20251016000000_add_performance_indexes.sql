-- Performance Optimization: Add Critical Indexes for 200 Concurrent Users
-- This migration adds composite and partial indexes to optimize common query patterns

-- ============================================================================
-- PROFILES TABLE INDEXES
-- ============================================================================

-- Composite index for role-based username lookups (used in search/filtering)
CREATE INDEX IF NOT EXISTS idx_profiles_role_username 
ON profiles(role, username) 
WHERE username IS NOT NULL;

-- Index for role-based filtering with created_at sorting
CREATE INDEX IF NOT EXISTS idx_profiles_role_created 
ON profiles(role, created_at DESC);

-- ============================================================================
-- VACANCIES TABLE INDEXES
-- ============================================================================

-- Composite index for common vacancy queries (status + position + club)
CREATE INDEX IF NOT EXISTS idx_vacancies_status_position_club 
ON vacancies(status, position, club_id);

-- Partial index for open vacancies (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_vacancies_open 
ON vacancies(club_id, created_at DESC, position) 
WHERE status = 'open';

-- Partial index for published vacancies with deadline sorting
CREATE INDEX IF NOT EXISTS idx_vacancies_published 
ON vacancies(application_deadline DESC NULLS LAST) 
WHERE status = 'open' AND published_at IS NOT NULL;

-- Index for club's vacancy management dashboard
CREATE INDEX IF NOT EXISTS idx_vacancies_club_status_updated 
ON vacancies(club_id, status, updated_at DESC);


CREATE INDEX IF NOT EXISTS idx_vacancy_apps_vacancy_status 
ON vacancy_applications(vacancy_id, status, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_vacancy_apps_applicant_status 
ON vacancy_applications(player_id, status, applied_at DESC);

-- Unique constraint to prevent duplicate applications (safety measure)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_application 
ON vacancy_applications(vacancy_id, player_id);

-- ============================================================================
-- GALLERY PHOTOS TABLE INDEXES
-- ============================================================================

-- Composite index for user's photo gallery with date sorting
CREATE INDEX IF NOT EXISTS idx_gallery_photos_user_created 
ON gallery_photos(user_id, created_at DESC);

-- ============================================================================
-- PLAYING HISTORY TABLE INDEXES
-- ============================================================================

-- Composite index for player's history timeline
CREATE INDEX IF NOT EXISTS idx_playing_history_user_display 
ON playing_history(user_id, display_order DESC);

-- Index for current/active positions (no end date)
CREATE INDEX IF NOT EXISTS idx_playing_history_recent 
ON playing_history(user_id, created_at DESC);

-- ============================================================================
-- CONVERSATIONS TABLE INDEXES (Already exists, adding missing ones)
-- ============================================================================

-- Composite index for finding conversation between two specific users
CREATE INDEX IF NOT EXISTS idx_conversations_participants_composite 
ON conversations(LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id));

-- Index for unread conversation count queries
CREATE INDEX IF NOT EXISTS idx_conversations_unread 
ON conversations(participant_one_id, last_message_at DESC) 
WHERE last_message_at IS NOT NULL;

-- ============================================================================
-- MESSAGES TABLE INDEXES (Enhanced)
-- ============================================================================

-- Partial index for unread messages (most common query)
CREATE INDEX IF NOT EXISTS idx_messages_unread_by_conversation 
ON messages(conversation_id, sent_at DESC) 
WHERE read_at IS NULL;

-- Composite index for message pagination
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent 
ON messages(conversation_id, sent_at DESC);

-- ============================================================================
-- QUERY PERFORMANCE TIPS
-- ============================================================================

COMMENT ON INDEX idx_profiles_role_username IS 'Optimizes user search by role and username';
COMMENT ON INDEX idx_vacancies_open IS 'Optimizes public vacancy browsing (most frequent query)';
COMMENT ON INDEX idx_vacancy_apps_vacancy_status IS 'Optimizes club viewing applicants for a vacancy';
COMMENT ON INDEX idx_messages_unread_by_conversation IS 'Optimizes unread message badge counts';
COMMENT ON INDEX idx_unique_application IS 'Prevents duplicate applications (data integrity)';

-- ============================================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- ============================================================================

-- Update statistics for better query planning
ANALYZE profiles;
ANALYZE vacancies;
ANALYZE vacancy_applications;
ANALYZE gallery_photos;
ANALYZE playing_history;
ANALYZE conversations;
ANALYZE messages;

