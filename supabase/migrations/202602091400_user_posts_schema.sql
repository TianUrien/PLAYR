-- ============================================================================
-- USER POSTS SCHEMA
-- ============================================================================
-- Creates tables for user-generated posts, likes, and comments.
-- Also creates the 'user-posts' storage bucket for post images.
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('user-posts', 'user-posts', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "user_posts_bucket_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-posts');

-- Authenticated users write to their own folder
CREATE POLICY "user_posts_bucket_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-posts'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1) = auth.uid()::TEXT
  );

-- Authenticated users can update their own files
CREATE POLICY "user_posts_bucket_auth_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-posts'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1) = auth.uid()::TEXT
  );

-- Authenticated users can delete their own files
CREATE POLICY "user_posts_bucket_auth_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-posts'
    AND auth.role() = 'authenticated'
    AND split_part(name, '/', 1) = auth.uid()::TEXT
  );

-- ============================================================================
-- 2. USER_POSTS TABLE
-- ============================================================================

CREATE TABLE public.user_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  images JSONB DEFAULT NULL,
  like_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,

  -- Content validation
  CONSTRAINT user_posts_content_not_empty CHECK (char_length(trim(content)) > 0),
  CONSTRAINT user_posts_content_max CHECK (char_length(content) <= 2000)
);

COMMENT ON TABLE public.user_posts IS 'User-generated posts for the Home feed';

-- Indexes
CREATE INDEX idx_user_posts_author ON public.user_posts (author_id);
CREATE INDEX idx_user_posts_feed ON public.user_posts (created_at DESC) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE public.user_posts ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted posts
CREATE POLICY "user_posts_select_public"
  ON public.user_posts FOR SELECT
  USING (deleted_at IS NULL);

-- Authenticated users can create posts
CREATE POLICY "user_posts_insert_own"
  ON public.user_posts FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Authors can update their own posts (content, images, soft delete)
CREATE POLICY "user_posts_update_own"
  ON public.user_posts FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

-- No hard deletes
CREATE POLICY "user_posts_delete_blocked"
  ON public.user_posts FOR DELETE
  TO authenticated
  USING (false);

-- Grants
GRANT SELECT ON public.user_posts TO authenticated;
GRANT INSERT ON public.user_posts TO authenticated;
GRANT UPDATE ON public.user_posts TO authenticated;
GRANT SELECT ON public.user_posts TO anon;

-- ============================================================================
-- 3. POST_LIKES TABLE
-- ============================================================================

CREATE TABLE public.post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- One like per user per post
  CONSTRAINT post_likes_unique UNIQUE (post_id, user_id)
);

COMMENT ON TABLE public.post_likes IS 'Likes on user-generated posts';

-- Index for counting likes per post
CREATE INDEX idx_post_likes_post ON public.post_likes (post_id);

-- RLS
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can see likes
CREATE POLICY "post_likes_select_authenticated"
  ON public.post_likes FOR SELECT
  TO authenticated
  USING (true);

-- Users can like posts
CREATE POLICY "post_likes_insert_own"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can unlike their own likes
CREATE POLICY "post_likes_delete_own"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Grants
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;

-- ============================================================================
-- 4. POST_COMMENTS TABLE
-- ============================================================================

CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.user_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  deleted_at TIMESTAMPTZ,

  -- Content validation
  CONSTRAINT post_comments_content_not_empty CHECK (char_length(trim(content)) > 0),
  CONSTRAINT post_comments_content_max CHECK (char_length(content) <= 500)
);

COMMENT ON TABLE public.post_comments IS 'Comments on user-generated posts';

-- Index for fetching comments in order
CREATE INDEX idx_post_comments_post ON public.post_comments (post_id, created_at) WHERE deleted_at IS NULL;

-- RLS
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-deleted comments
CREATE POLICY "post_comments_select_public"
  ON public.post_comments FOR SELECT
  USING (deleted_at IS NULL);

-- Authenticated users can create comments
CREATE POLICY "post_comments_insert_own"
  ON public.post_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Authors can soft-delete their own comments
CREATE POLICY "post_comments_update_own"
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

-- No hard deletes
CREATE POLICY "post_comments_delete_blocked"
  ON public.post_comments FOR DELETE
  TO authenticated
  USING (false);

-- Grants
GRANT SELECT ON public.post_comments TO authenticated;
GRANT INSERT ON public.post_comments TO authenticated;
GRANT UPDATE ON public.post_comments TO authenticated;
GRANT SELECT ON public.post_comments TO anon;

-- ============================================================================
-- 5. TRIGGERS: LIKE COUNT MAINTENANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_post_like_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  -- Determine which post to update
  IF TG_OP = 'DELETE' THEN
    v_post_id := OLD.post_id;
  ELSE
    v_post_id := NEW.post_id;
  END IF;

  UPDATE user_posts
  SET like_count = (
    SELECT COUNT(*) FROM post_likes WHERE post_id = v_post_id
  )
  WHERE id = v_post_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_post_like_count_insert
  AFTER INSERT ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_like_count();

CREATE TRIGGER trigger_post_like_count_delete
  AFTER DELETE ON public.post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_like_count();

-- ============================================================================
-- 6. TRIGGERS: COMMENT COUNT MAINTENANCE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_post_comment_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id UUID;
BEGIN
  v_post_id := NEW.post_id;

  UPDATE user_posts
  SET comment_count = (
    SELECT COUNT(*) FROM post_comments
    WHERE post_id = v_post_id AND deleted_at IS NULL
  )
  WHERE id = v_post_id;

  RETURN NEW;
END;
$$;

-- Count on new comment
CREATE TRIGGER trigger_post_comment_count_insert
  AFTER INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_comment_count();

-- Recount on soft-delete (deleted_at changes)
CREATE TRIGGER trigger_post_comment_count_update
  AFTER UPDATE OF deleted_at ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_post_comment_count();

-- ============================================================================
-- 7. TRIGGER: COMMENT RATE LIMIT (20 per 24 hours)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_post_comment_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_recent_count
  FROM post_comments
  WHERE author_id = NEW.author_id
    AND created_at > (now() - interval '24 hours');

  IF v_recent_count >= 20 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 20 comments per 24 hours';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_post_comment_rate_limit
  BEFORE INSERT ON public.post_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_post_comment_rate_limit();
