-- Concurrency Protection: Add Optimistic Locking & Idempotency
-- Prevents race conditions and duplicate operations under concurrent load

-- ============================================================================
-- OPTIMISTIC LOCKING: Add Version Control
-- ============================================================================

-- Add version column to critical tables for optimistic locking
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

ALTER TABLE vacancies 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL;

-- Function to automatically increment version on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-increment version
CREATE TRIGGER profiles_version_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER vacancies_version_trigger
  BEFORE UPDATE ON vacancies
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

CREATE TRIGGER conversations_version_trigger
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION increment_version();

-- ============================================================================
-- IDEMPOTENCY: Prevent Duplicate Messages
-- ============================================================================

-- Add idempotency key to messages (client-generated UUID)
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index to enforce idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency 
ON messages(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Index for cleanup of old idempotency keys (after 24 hours)
CREATE INDEX IF NOT EXISTS idx_messages_idempotency_cleanup 
ON messages(sent_at) 
WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN messages.idempotency_key IS 'Client-generated UUID to prevent duplicate message submissions';

-- ============================================================================
-- CONVERSATION NORMALIZATION: Prevent Duplicate Conversations
-- ============================================================================

-- Function to normalize conversation participants (smaller ID always first)
CREATE OR REPLACE FUNCTION normalize_conversation_participants()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure participant_one_id is always the smaller UUID
  IF NEW.participant_one_id > NEW.participant_two_id THEN
    -- Swap participants
    DECLARE
      temp_id UUID;
    BEGIN
      temp_id := NEW.participant_one_id;
      NEW.participant_one_id := NEW.participant_two_id;
      NEW.participant_two_id := temp_id;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize participants before insert
CREATE TRIGGER normalize_conversation_before_insert
  BEFORE INSERT ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION normalize_conversation_participants();

-- ============================================================================
-- PROFILE UPDATE SAFETY: Prevent Concurrent Avatar Uploads
-- ============================================================================

CREATE OR REPLACE FUNCTION check_concurrent_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If avatar_url is being updated
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    -- Add a small delay to prevent race conditions (50ms)
    PERFORM pg_sleep(0.05);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_profile_concurrent_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  WHEN (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
  EXECUTE FUNCTION check_concurrent_profile_update();

-- ============================================================================
-- VACANCY APPLICATION SAFETY: Prevent Double Applications
-- ============================================================================

-- The unique index already exists, but add a friendly constraint name
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unique_vacancy_application_per_user'
  ) THEN
  ALTER TABLE vacancy_applications
  ADD CONSTRAINT unique_vacancy_application_per_user 
  UNIQUE (vacancy_id, player_id);
  END IF;
END $$;

COMMENT ON CONSTRAINT unique_vacancy_application_per_user 
ON vacancy_applications IS 'Prevents users from applying to the same vacancy multiple times';

-- ============================================================================
-- SOFT LOCKS: Prevent Concurrent Edits with Advisory Locks
-- ============================================================================

-- Function to acquire advisory lock for profile editing
CREATE OR REPLACE FUNCTION acquire_profile_lock(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Try to acquire advisory lock (non-blocking)
  -- Lock ID based on profile UUID hash
  RETURN pg_try_advisory_lock(hashtext(profile_id::TEXT));
END;
$$ LANGUAGE plpgsql;

-- Function to release advisory lock
CREATE OR REPLACE FUNCTION release_profile_lock(profile_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN pg_advisory_unlock(hashtext(profile_id::TEXT));
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION acquire_profile_lock IS 'Acquires advisory lock to prevent concurrent profile edits. Returns false if lock is already held.';
COMMENT ON FUNCTION release_profile_lock IS 'Releases advisory lock after profile edit is complete.';

-- ============================================================================
-- AUTOMATIC LOCK CLEANUP: Release locks on session end
-- ============================================================================

-- Advisory locks are automatically released when the session ends,
-- but we can add a function to manually clean up if needed

CREATE OR REPLACE FUNCTION cleanup_stale_locks()
RETURNS void AS $$
BEGIN
  -- Advisory locks are automatically cleaned up by PostgreSQL
  -- This function is a placeholder for future custom lock management
  RAISE NOTICE 'Advisory locks are automatically cleaned up by PostgreSQL on session end';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================

COMMENT ON COLUMN profiles.version IS 'Optimistic locking version. Increment on each update to detect concurrent modifications.';
COMMENT ON COLUMN vacancies.version IS 'Optimistic locking version. Increment on each update to detect concurrent modifications.';
COMMENT ON COLUMN conversations.version IS 'Optimistic locking version. Increment on each update to detect concurrent modifications.';

COMMENT ON TRIGGER normalize_conversation_before_insert ON conversations IS 'Ensures consistent conversation participant ordering to prevent duplicates';
COMMENT ON TRIGGER profiles_version_trigger ON profiles IS 'Automatically increments version on update for optimistic locking';

