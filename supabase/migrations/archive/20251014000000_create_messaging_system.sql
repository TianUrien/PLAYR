-- Create messaging system for player-club communication
-- Enables direct messages between players and clubs with real-time updates

-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_one_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_two_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  
  -- Ensure unique conversation between two participants (order-independent)
  CONSTRAINT unique_conversation UNIQUE (participant_one_id, participant_two_id),
  CONSTRAINT different_participants CHECK (participant_one_id != participant_two_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  
  -- Message content validation
  CONSTRAINT content_length CHECK (char_length(content) > 0 AND char_length(content) <= 1000)
);

-- Create indexes for performance
CREATE INDEX idx_conversations_participant_one ON public.conversations(participant_one_id);
CREATE INDEX idx_conversations_participant_two ON public.conversations(participant_two_id);
CREATE INDEX idx_conversations_updated_at ON public.conversations(updated_at DESC);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_sent_at ON public.messages(sent_at DESC);
CREATE INDEX idx_messages_read_at ON public.messages(read_at) WHERE read_at IS NULL;

-- Function to update conversation's last_message_at and updated_at
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message_at = NEW.sent_at,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update conversation timestamp when new message is sent
CREATE TRIGGER update_conversation_on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_timestamp();

-- Auto-update conversations updated_at timestamp
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view conversations they are part of
CREATE POLICY "Users can view their own conversations"
  ON public.conversations
  FOR SELECT
  USING (
    participant_one_id = auth.uid() OR participant_two_id = auth.uid()
  );

-- RLS Policy: Users can create conversations with others
CREATE POLICY "Users can create conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    participant_one_id = auth.uid() OR participant_two_id = auth.uid()
  );

-- RLS Policy: Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
    )
  );

-- RLS Policy: Users can send messages in their conversations
CREATE POLICY "Users can send messages in their conversations"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
    )
  );

-- RLS Policy: Users can mark messages as read (only the recipient)
CREATE POLICY "Users can mark messages as read"
  ON public.messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
      AND sender_id != auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.participant_one_id = auth.uid() OR c.participant_two_id = auth.uid())
      AND sender_id != auth.uid()
    )
  );

-- Add comments for documentation
COMMENT ON TABLE public.conversations IS 'Stores conversations between players and clubs';
COMMENT ON TABLE public.messages IS 'Stores individual messages within conversations with read receipt tracking';
COMMENT ON COLUMN public.messages.content IS 'Message content limited to 1000 characters';
COMMENT ON COLUMN public.messages.read_at IS 'Timestamp when message was read by recipient (NULL = unread)';
