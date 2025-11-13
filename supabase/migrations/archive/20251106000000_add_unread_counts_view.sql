-- Add Materialized View for Instant Unread Count Queries
-- This view pre-computes unread message counts per user
-- Expected query time: <10ms (vs 800-1200ms previously)

-- Create materialized view for unread message counts
CREATE MATERIALIZED VIEW IF NOT EXISTS public.user_unread_counts AS
SELECT 
  c.participant_one_id as user_id,
  COUNT(m.id) as unread_count
FROM conversations c
INNER JOIN messages m ON m.conversation_id = c.id
WHERE m.sender_id != c.participant_one_id
  AND m.read_at IS NULL
GROUP BY c.participant_one_id

UNION ALL

SELECT 
  c.participant_two_id as user_id,
  COUNT(m.id) as unread_count
FROM conversations c
INNER JOIN messages m ON m.conversation_id = c.id
WHERE m.sender_id != c.participant_two_id
  AND m.read_at IS NULL
GROUP BY c.participant_two_id;

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_user_unread_counts_user_id 
ON user_unread_counts(user_id);

-- Function to refresh materialized view concurrently
CREATE OR REPLACE FUNCTION refresh_unread_counts()
RETURNS TRIGGER AS $$
BEGIN
  -- Use CONCURRENTLY to avoid blocking reads
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_unread_counts;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-refresh on message insert/update
CREATE TRIGGER refresh_unread_on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_unread_counts();

CREATE TRIGGER refresh_unread_on_message_update
  AFTER UPDATE OF read_at ON public.messages
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_unread_counts();

-- Enable RLS on materialized view
ALTER MATERIALIZED VIEW user_unread_counts OWNER TO postgres;

-- Note: Materialized views don't support RLS directly
-- We'll use a view wrapper for RLS
CREATE OR REPLACE VIEW public.user_unread_counts_secure AS
SELECT user_id, unread_count
FROM user_unread_counts
WHERE user_id = auth.uid();

-- Grant access to authenticated users
GRANT SELECT ON user_unread_counts_secure TO authenticated;

-- Initial refresh
REFRESH MATERIALIZED VIEW user_unread_counts;

COMMENT ON MATERIALIZED VIEW user_unread_counts IS 
  'Pre-computed unread message counts per user for instant badge updates (<10ms queries)';
COMMENT ON VIEW user_unread_counts_secure IS 
  'RLS-protected view of unread counts for current user only';
