-- 202511141745_profile_comments.sql
-- Implements identity-based comments/testimonials for all profile types.

SET search_path = public;

-- =========================================================================
-- ENUMS
-- =========================================================================
DO $$ BEGIN
  CREATE TYPE comment_status AS ENUM ('visible', 'hidden', 'reported', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE comment_rating AS ENUM ('positive', 'neutral', 'negative');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =========================================================================
-- TABLE
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.profile_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 10 AND 1000),
  rating comment_rating,
  status comment_status NOT NULL DEFAULT 'visible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

COMMENT ON TABLE public.profile_comments IS 'Professional testimonials/comments between verified profiles.';
COMMENT ON COLUMN public.profile_comments.profile_id IS 'Profile receiving the feedback.';
COMMENT ON COLUMN public.profile_comments.author_profile_id IS 'Profile that authored the comment.';
COMMENT ON COLUMN public.profile_comments.status IS 'Moderation state: visible | hidden | reported | deleted.';

CREATE INDEX IF NOT EXISTS profile_comments_profile_id_idx ON public.profile_comments (profile_id);
CREATE INDEX IF NOT EXISTS profile_comments_author_profile_id_idx ON public.profile_comments (author_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS profile_comments_active_unique
  ON public.profile_comments (profile_id, author_profile_id)
  WHERE status IN ('visible', 'hidden', 'reported');

-- =========================================================================
-- FUNCTIONS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_admin')::BOOLEAN,
    FALSE
  );
$$;

COMMENT ON FUNCTION public.is_platform_admin IS 'Evaluates current JWT claims to determine admin/moderator privileges.';

CREATE OR REPLACE FUNCTION public.enforce_profile_comment_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 5;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  IF NEW.author_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
  INTO recent_total
  FROM public.profile_comments
  WHERE author_profile_id = NEW.author_profile_id
    AND created_at >= window_start
    AND status <> 'deleted';

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'comment_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s comments per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.enforce_profile_comment_rate_limit IS 'Prevents users from posting more than 5 comments in a rolling 24h period.';

CREATE OR REPLACE FUNCTION public.set_profile_comment_status(
  p_comment_id UUID,
  p_status comment_status
)
RETURNS public.profile_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_comment public.profile_comments;
  requester UUID := auth.uid();
BEGIN
  IF requester IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_platform_admin() AND p_status NOT IN ('visible', 'hidden') THEN
    RAISE EXCEPTION 'status_not_permitted';
  END IF;

  UPDATE public.profile_comments
  SET status = p_status,
      updated_at = timezone('utc', now())
  WHERE id = p_comment_id
    AND (profile_id = requester OR public.is_platform_admin())
  RETURNING * INTO updated_comment;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN updated_comment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_comment_status(UUID, comment_status) TO authenticated;
COMMENT ON FUNCTION public.set_profile_comment_status IS 'Allows profile owners (or admins) to toggle a comment''s visibility state.';

-- =========================================================================
-- TRIGGERS
-- =========================================================================
DROP TRIGGER IF EXISTS set_profile_comments_updated_at ON public.profile_comments;
CREATE TRIGGER set_profile_comments_updated_at
  BEFORE UPDATE ON public.profile_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS profile_comments_rate_limit ON public.profile_comments;
CREATE TRIGGER profile_comments_rate_limit
  BEFORE INSERT ON public.profile_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_comment_rate_limit();

-- =========================================================================
-- RLS
-- =========================================================================
ALTER TABLE public.profile_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Visible comments are public" ON public.profile_comments;
CREATE POLICY "Visible comments are public"
  ON public.profile_comments
  FOR SELECT
  USING (
    status = 'visible'
    OR profile_id = auth.uid()
    OR author_profile_id = auth.uid()
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Users can create comments" ON public.profile_comments;
CREATE POLICY "Users can create comments"
  ON public.profile_comments
  FOR INSERT
  WITH CHECK (
    auth.uid() = author_profile_id
    AND author_profile_id <> profile_id
  );

DROP POLICY IF EXISTS "Authors can edit comments" ON public.profile_comments;
CREATE POLICY "Authors can edit comments"
  ON public.profile_comments
  FOR UPDATE
  USING (auth.uid() = author_profile_id)
  WITH CHECK (auth.uid() = author_profile_id);

DROP POLICY IF EXISTS "Admins can manage comments" ON public.profile_comments;
CREATE POLICY "Admins can manage comments"
  ON public.profile_comments
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
