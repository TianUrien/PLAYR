-- Create playing_history table
CREATE TABLE playing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  club_name TEXT NOT NULL,
  position_role TEXT NOT NULL,
  years TEXT NOT NULL,
  division_league TEXT NOT NULL,
  achievements TEXT[] DEFAULT '{}',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE playing_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own history
CREATE POLICY "Users can view their own playing history"
ON playing_history FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own history
CREATE POLICY "Users can insert their own playing history"
ON playing_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own history
CREATE POLICY "Users can update their own playing history"
ON playing_history FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own history
CREATE POLICY "Users can delete their own playing history"
ON playing_history FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_playing_history_user_id ON playing_history(user_id);
CREATE INDEX idx_playing_history_display_order ON playing_history(user_id, display_order DESC);
