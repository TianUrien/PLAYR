-- 005_indexes_views_storage.sql
-- Secondary indexes, analytical views, and storage policies for PLAYR Supabase
-- Run via: supabase db execute --file supabase_setup/005_storage.sql

SET search_path = public;

-- ============================================================================
-- PROFILES INDEXES
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
  ON public.profiles (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_unique
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles (username)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed
  ON public.profiles (onboarding_completed);

CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_created
  ON public.profiles (created_at DESC)
  WHERE onboarding_completed = TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_role_created
  ON public.profiles (role, created_at DESC);

-- ============================================================================
-- VACANCIES INDEXES
-- ============================================================================
CREATE INDEX idx_vacancies_club_id
  ON public.vacancies (club_id);

CREATE INDEX idx_vacancies_club_status
  ON public.vacancies (club_id, status);

CREATE INDEX idx_vacancies_status_position_club
  ON public.vacancies (status, position, club_id);

CREATE INDEX idx_vacancies_open
  ON public.vacancies (club_id, created_at DESC, position)
  WHERE status = 'open';

CREATE INDEX idx_vacancies_published
  ON public.vacancies (application_deadline DESC NULLS LAST)
  WHERE status = 'open' AND published_at IS NOT NULL;

CREATE INDEX idx_vacancies_club_status_updated
  ON public.vacancies (club_id, status, updated_at DESC);

-- ============================================================================
-- VACANCY APPLICATIONS INDEXES
-- ============================================================================
CREATE INDEX idx_vacancy_apps_vacancy_status
  ON public.vacancy_applications (vacancy_id, status, applied_at DESC);

CREATE INDEX idx_vacancy_apps_player_status
  ON public.vacancy_applications (player_id, status, applied_at DESC);

-- ============================================================================
-- MEDIA & HISTORY INDEXES
-- ============================================================================
CREATE INDEX idx_gallery_photos_user_created
  ON public.gallery_photos (user_id, created_at DESC);

CREATE INDEX idx_playing_history_user_display
  ON public.playing_history (user_id, display_order DESC);

CREATE INDEX idx_club_media_club_order
  ON public.club_media (club_id, order_index, created_at DESC);

-- ============================================================================
-- MESSAGING INDEXES
-- ============================================================================
CREATE INDEX idx_conversations_participant_one
  ON public.conversations (participant_one_id);

CREATE INDEX idx_conversations_participant_two
  ON public.conversations (participant_two_id);

CREATE INDEX idx_conversations_updated_at
  ON public.conversations (updated_at DESC);

CREATE INDEX idx_conversations_last_message
  ON public.conversations (last_message_at DESC NULLS LAST);

CREATE INDEX idx_conversations_participants_composite
  ON public.conversations (LEAST(participant_one_id, participant_two_id), GREATEST(participant_one_id, participant_two_id));

CREATE INDEX idx_conversations_id_participants
  ON public.conversations (id, participant_one_id, participant_two_id);

CREATE INDEX idx_conversations_unread
  ON public.conversations (participant_one_id, last_message_at DESC)
  WHERE last_message_at IS NOT NULL;

CREATE INDEX idx_messages_conversation
  ON public.messages (conversation_id);

CREATE INDEX idx_messages_sender
  ON public.messages (sender_id);

CREATE INDEX idx_messages_sent_at
  ON public.messages (sent_at DESC);

CREATE INDEX idx_messages_unread_read_at
  ON public.messages (read_at)
  WHERE read_at IS NULL;

CREATE INDEX idx_messages_unread_lookup
  ON public.messages (conversation_id, sender_id, read_at)
  WHERE read_at IS NULL;

CREATE INDEX idx_messages_unread_by_conversation
  ON public.messages (conversation_id, sent_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX idx_messages_conversation_sent
  ON public.messages (conversation_id, sent_at DESC);

CREATE UNIQUE INDEX idx_messages_idempotency
  ON public.messages (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_messages_idempotency_cleanup
  ON public.messages (sent_at)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- UNREAD MESSAGE VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW public.user_unread_counts AS
WITH participant_one_unread AS (
  SELECT
    c.participant_one_id AS user_id,
    COUNT(m.id) AS unread_count
  FROM public.conversations c
  INNER JOIN public.messages m ON m.conversation_id = c.id
  WHERE m.sender_id = c.participant_two_id
    AND m.read_at IS NULL
  GROUP BY c.participant_one_id
),
participant_two_unread AS (
  SELECT
    c.participant_two_id AS user_id,
    COUNT(m.id) AS unread_count
  FROM public.conversations c
  INNER JOIN public.messages m ON m.conversation_id = c.id
  WHERE m.sender_id = c.participant_one_id
    AND m.read_at IS NULL
  GROUP BY c.participant_two_id
)
SELECT user_id, SUM(unread_count) AS unread_count
FROM (
  SELECT * FROM participant_one_unread
  UNION ALL
  SELECT * FROM participant_two_unread
) combined
GROUP BY user_id;

CREATE OR REPLACE VIEW public.user_unread_counts_secure AS
SELECT user_id, unread_count
FROM public.user_unread_counts
WHERE user_id = auth.uid();

GRANT SELECT ON public.user_unread_counts TO authenticated;
GRANT SELECT ON public.user_unread_counts_secure TO authenticated;

COMMENT ON VIEW public.user_unread_counts IS 'Real-time unread message counts per user (leverages optimized indexes)';
COMMENT ON VIEW public.user_unread_counts_secure IS 'RLS wrapper exposing unread counts to the current user only';

-- ============================================================================
-- STORAGE BUCKETS & POLICIES
-- ============================================================================
SET search_path = storage;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', TRUE),
  ('gallery', 'gallery', TRUE),
  ('club-media', 'club-media', TRUE),
  ('player-media', 'player-media', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Helper expressions reused in policies
-- split_part(name, '/', 1) equals the root folder when the convention is userId/filename

DROP POLICY IF EXISTS "Public avatar access" ON storage.objects;
CREATE POLICY "Public avatar access"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users upload avatars" ON storage.objects;
CREATE POLICY "Users upload avatars"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Users update avatars" ON storage.objects;
CREATE POLICY "Users update avatars"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Users delete avatars" ON storage.objects;
CREATE POLICY "Users delete avatars"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'avatars'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Public gallery access" ON storage.objects;
CREATE POLICY "Public gallery access"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');

DROP POLICY IF EXISTS "Users upload gallery files" ON storage.objects;
CREATE POLICY "Users upload gallery files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'gallery'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Users update gallery files" ON storage.objects;
CREATE POLICY "Users update gallery files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'gallery'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Users delete gallery files" ON storage.objects;
CREATE POLICY "Users delete gallery files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'gallery'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Public club media access" ON storage.objects;
CREATE POLICY "Public club media access"
ON storage.objects FOR SELECT
USING (bucket_id = 'club-media');

DROP POLICY IF EXISTS "Clubs upload club media" ON storage.objects;
CREATE POLICY "Clubs upload club media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'club-media'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Clubs update club media" ON storage.objects;
CREATE POLICY "Clubs update club media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'club-media'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Clubs delete club media" ON storage.objects;
CREATE POLICY "Clubs delete club media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'club-media'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Public player media access" ON storage.objects;
CREATE POLICY "Public player media access"
ON storage.objects FOR SELECT
USING (bucket_id = 'player-media');

DROP POLICY IF EXISTS "Users upload player media" ON storage.objects;
CREATE POLICY "Users upload player media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'player-media'
  AND auth.role() = 'authenticated'
  AND split_part(name, '/', 1) = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "Users update player media" ON storage.objects;
CREATE POLICY "Users update player media"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'player-media'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "Users delete player media" ON storage.objects;
CREATE POLICY "Users delete player media"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'player-media'
  AND auth.role() = 'authenticated'
  AND owner = auth.uid()
);
