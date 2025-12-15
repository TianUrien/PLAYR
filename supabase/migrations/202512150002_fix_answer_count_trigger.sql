-- 202512150002_fix_answer_count_trigger.sql
-- Fix: Add SECURITY DEFINER to answer count trigger function
-- This allows the trigger to bypass RLS when updating the question's answer_count

SET search_path = public;

-- Recreate the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_question_answer_count()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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

COMMENT ON FUNCTION public.update_question_answer_count IS 'Trigger function to maintain answer_count on community_questions. Uses SECURITY DEFINER to bypass RLS.';

-- Fix existing data: recalculate answer counts for all questions
UPDATE public.community_questions q
SET answer_count = (
  SELECT COUNT(*)
  FROM public.community_answers a
  WHERE a.question_id = q.id
    AND a.deleted_at IS NULL
);
