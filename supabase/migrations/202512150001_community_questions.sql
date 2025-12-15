-- 202512150001_community_questions.sql
-- Community Questions & Answers feature
-- Adds tables for Q&A functionality in the Community section

SET search_path = public;

-- ============================================================================
-- QUESTION CATEGORIES ENUM
-- ============================================================================
CREATE TYPE public.question_category AS ENUM (
  'trials_club_selection',
  'visas_moving_abroad',
  'scholarships_universities',
  'highlights_visibility',
  'training_performance',
  'coaching_development',
  'lifestyle_adaptation',
  'other'
);

COMMENT ON TYPE public.question_category IS 'Predefined categories for community questions';

-- ============================================================================
-- COMMUNITY QUESTIONS TABLE
-- ============================================================================
CREATE TABLE public.community_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  category public.question_category NOT NULL DEFAULT 'other',
  answer_count INTEGER NOT NULL DEFAULT 0,
  is_test_content BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  -- Constraints
  CONSTRAINT community_questions_title_length CHECK (char_length(title) <= 120),
  CONSTRAINT community_questions_body_length CHECK (body IS NULL OR char_length(body) <= 1500)
);

COMMENT ON TABLE public.community_questions IS 'Community Q&A questions asked by users';
COMMENT ON COLUMN public.community_questions.is_test_content IS 'Inherited from author is_test_account at creation time';
COMMENT ON COLUMN public.community_questions.deleted_at IS 'Soft-delete timestamp; NULL means active';

-- ============================================================================
-- COMMUNITY ANSWERS TABLE
-- ============================================================================
CREATE TABLE public.community_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.community_questions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_test_content BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  
  -- Constraints
  CONSTRAINT community_answers_body_length CHECK (char_length(body) <= 1500)
);

COMMENT ON TABLE public.community_answers IS 'Answers to community questions';
COMMENT ON COLUMN public.community_answers.is_test_content IS 'Inherited from author is_test_account at creation time';
COMMENT ON COLUMN public.community_answers.deleted_at IS 'Soft-delete timestamp; NULL means active';

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Questions: list by category, sorted by recency
CREATE INDEX idx_community_questions_category_created 
  ON public.community_questions (category, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Questions: list all, sorted by recency  
CREATE INDEX idx_community_questions_created 
  ON public.community_questions (created_at DESC) 
  WHERE deleted_at IS NULL;

-- Questions: list by most answers
CREATE INDEX idx_community_questions_answer_count 
  ON public.community_questions (answer_count DESC, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Questions: filter test content
CREATE INDEX idx_community_questions_test_content 
  ON public.community_questions (is_test_content, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Questions: author lookup
CREATE INDEX idx_community_questions_author 
  ON public.community_questions (author_id, created_at DESC);

-- Answers: list by question
CREATE INDEX idx_community_answers_question 
  ON public.community_answers (question_id, created_at ASC) 
  WHERE deleted_at IS NULL;

-- Answers: author lookup (for rate limiting)
CREATE INDEX idx_community_answers_author 
  ON public.community_answers (author_id, created_at DESC);

-- ============================================================================
-- FUNCTIONS: SET TEST CONTENT FLAG
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_question_test_content_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Inherit is_test_account from author's profile
  SELECT COALESCE(is_test_account, false)
  INTO NEW.is_test_content
  FROM public.profiles
  WHERE id = NEW.author_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.set_answer_test_content_flag()
RETURNS TRIGGER AS $$
BEGIN
  -- Inherit is_test_account from author's profile
  SELECT COALESCE(is_test_account, false)
  INTO NEW.is_test_content
  FROM public.profiles
  WHERE id = NEW.author_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: UPDATE ANSWER COUNT
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_question_answer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_questions
    SET answer_count = answer_count + 1
    WHERE id = NEW.question_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle soft-delete: decrement if answer was soft-deleted
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.community_questions
      SET answer_count = GREATEST(0, answer_count - 1)
      WHERE id = NEW.question_id;
    -- Handle restore: increment if answer was un-deleted
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.community_questions
      SET answer_count = answer_count + 1
      WHERE id = NEW.question_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Only decrement if wasn't already soft-deleted
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.community_questions
      SET answer_count = GREATEST(0, answer_count - 1)
      WHERE id = OLD.question_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTIONS: RATE LIMITING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_question_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 3;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO recent_total
  FROM public.community_questions
  WHERE author_id = NEW.author_id
    AND created_at >= window_start;

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'question_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s questions per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.enforce_question_rate_limit IS 'Prevents users from posting more than 3 questions in a rolling 24h period.';

CREATE OR REPLACE FUNCTION public.enforce_answer_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  limit_per_day CONSTANT INTEGER := 10;
  window_start TIMESTAMPTZ := timezone('utc', now()) - interval '1 day';
  recent_total INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO recent_total
  FROM public.community_answers
  WHERE author_id = NEW.author_id
    AND created_at >= window_start;

  IF recent_total >= limit_per_day THEN
    RAISE EXCEPTION 'answer_rate_limit_exceeded'
      USING DETAIL = format('Limit of %s answers per 24h reached', limit_per_day);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.enforce_answer_rate_limit IS 'Prevents users from posting more than 10 answers in a rolling 24h period.';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at triggers
DROP TRIGGER IF EXISTS community_questions_updated_at ON public.community_questions;
CREATE TRIGGER community_questions_updated_at
  BEFORE UPDATE ON public.community_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS community_answers_updated_at ON public.community_answers;
CREATE TRIGGER community_answers_updated_at
  BEFORE UPDATE ON public.community_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Test content flag triggers
DROP TRIGGER IF EXISTS community_questions_set_test_flag ON public.community_questions;
CREATE TRIGGER community_questions_set_test_flag
  BEFORE INSERT ON public.community_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_question_test_content_flag();

DROP TRIGGER IF EXISTS community_answers_set_test_flag ON public.community_answers;
CREATE TRIGGER community_answers_set_test_flag
  BEFORE INSERT ON public.community_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_answer_test_content_flag();

-- Answer count triggers
DROP TRIGGER IF EXISTS community_answers_update_count ON public.community_answers;
CREATE TRIGGER community_answers_update_count
  AFTER INSERT OR UPDATE OF deleted_at OR DELETE ON public.community_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_question_answer_count();

-- Rate limit triggers
DROP TRIGGER IF EXISTS community_questions_rate_limit ON public.community_questions;
CREATE TRIGGER community_questions_rate_limit
  BEFORE INSERT ON public.community_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_question_rate_limit();

DROP TRIGGER IF EXISTS community_answers_rate_limit ON public.community_answers;
CREATE TRIGGER community_answers_rate_limit
  BEFORE INSERT ON public.community_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_answer_rate_limit();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.community_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_answers ENABLE ROW LEVEL SECURITY;

-- Questions: Anyone authenticated can read non-deleted questions
-- Test accounts see all; real accounts only see real content
CREATE POLICY "questions_select" ON public.community_questions
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      -- Test accounts can see everything
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_test_account = true
      )
      -- Real accounts only see real content
      OR is_test_content = false
      -- Or admin bypass
      OR public.is_platform_admin()
    )
  );

-- Questions: Authenticated users can insert
CREATE POLICY "questions_insert" ON public.community_questions
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author_id = auth.uid()
  );

-- Questions: Authors can update their own questions
CREATE POLICY "questions_update" ON public.community_questions
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Questions: Authors can delete (soft-delete) their own questions
CREATE POLICY "questions_delete" ON public.community_questions
  FOR DELETE
  USING (author_id = auth.uid() OR public.is_platform_admin());

-- Answers: Anyone authenticated can read non-deleted answers
CREATE POLICY "answers_select" ON public.community_answers
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND is_test_account = true
      )
      OR is_test_content = false
      OR public.is_platform_admin()
    )
  );

-- Answers: Authenticated users can insert
CREATE POLICY "answers_insert" ON public.community_answers
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND author_id = auth.uid()
  );

-- Answers: Authors can update their own answers
CREATE POLICY "answers_update" ON public.community_answers
  FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- Answers: Authors can delete their own answers
CREATE POLICY "answers_delete" ON public.community_answers
  FOR DELETE
  USING (author_id = auth.uid() OR public.is_platform_admin());

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_answers TO authenticated;
GRANT USAGE ON TYPE public.question_category TO authenticated;
