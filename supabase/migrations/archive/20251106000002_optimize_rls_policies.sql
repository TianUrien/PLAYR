-- Optimize RLS Policies for Messaging
-- Reduces RLS overhead by using a cached function instead of EXISTS subqueries
-- Expected improvement: 40-60% faster message queries

-- Create optimized function for user conversation check
CREATE OR REPLACE FUNCTION public.user_in_conversation(
  p_conversation_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM conversations 
    WHERE id = p_conversation_id
      AND (participant_one_id = p_user_id OR participant_two_id = p_user_id)
  );
$$;

-- Create composite index to support the function
CREATE INDEX IF NOT EXISTS idx_conversations_id_participants
ON conversations(id, participant_one_id, participant_two_id);

-- Drop existing slow policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON messages;

-- Create optimized RLS policies using the function
CREATE POLICY "Users can view messages in their conversations v2"
  ON public.messages
  FOR SELECT
  USING (
    public.user_in_conversation(conversation_id, auth.uid())
  );

CREATE POLICY "Users can send messages in their conversations v2"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() 
    AND public.user_in_conversation(conversation_id, auth.uid())
  );

CREATE POLICY "Users can mark messages as read v2"
  ON public.messages
  FOR UPDATE
  USING (
    public.user_in_conversation(conversation_id, auth.uid())
    AND sender_id != auth.uid()
  )
  WITH CHECK (
    public.user_in_conversation(conversation_id, auth.uid())
    AND sender_id != auth.uid()
  );

-- Update table statistics for better query planning
ANALYZE messages;
ANALYZE conversations;

COMMENT ON FUNCTION public.user_in_conversation IS 
  'Optimized function to check if a user is a participant in a conversation. Used by RLS policies for better performance.';
