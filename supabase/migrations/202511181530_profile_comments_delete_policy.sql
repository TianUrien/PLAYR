-- 202511181530_profile_comments_delete_policy.sql
-- Allow comment authors to delete their own testimonials while keeping admin overrides intact.

SET search_path = public;

ALTER TABLE IF EXISTS public.profile_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors can delete comments" ON public.profile_comments;
CREATE POLICY "Authors can delete comments"
  ON public.profile_comments
  FOR DELETE
  USING (auth.uid() = author_profile_id);
