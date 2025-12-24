-- ============================================================================
-- ADMIN ANALYTICS SCHEMA EXPANSION
-- ============================================================================
-- Adds schema support for enhanced admin analytics:
-- 1. Events table for funnel tracking
-- 2. Error logs table for reliability monitoring
-- 3. Profile columns for journey tracking
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- 1. EVENTS TABLE (Analytics Event Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role TEXT, -- Denormalized for faster analytics
  session_id TEXT, -- For session-level grouping
  entity_type TEXT, -- 'vacancy', 'application', 'profile', etc.
  entity_id UUID,
  properties JSONB DEFAULT '{}'::jsonb, -- Flexible event properties
  error_code TEXT, -- For error events
  error_message TEXT,
  user_agent TEXT,
  ip_hash TEXT, -- Hashed for privacy
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS events_event_name_idx ON public.events (event_name);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON public.events (user_id);
CREATE INDEX IF NOT EXISTS events_entity_idx ON public.events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS events_created_at_idx ON public.events (created_at DESC);
CREATE INDEX IF NOT EXISTS events_error_code_idx ON public.events (error_code) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_event_name_created_idx ON public.events (event_name, created_at DESC);

COMMENT ON TABLE public.events IS 'Analytics events for funnel tracking and error monitoring';
COMMENT ON COLUMN public.events.event_name IS 'Event identifier: signup.started, vacancy.viewed, etc.';
COMMENT ON COLUMN public.events.entity_type IS 'Related entity type: vacancy, application, profile';
COMMENT ON COLUMN public.events.properties IS 'Flexible JSON properties for event-specific data';

-- ============================================================================
-- 2. ERROR LOGS TABLE (Reliability Monitoring)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'frontend', 'edge_function', 'database'
  function_name TEXT, -- Edge function name or component
  error_type TEXT NOT NULL, -- 'validation', 'network', 'auth', 'database', 'unknown'
  error_code TEXT,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  correlation_id TEXT, -- For request tracing
  request_path TEXT,
  request_method TEXT,
  request_body JSONB, -- Sanitized (no PII)
  metadata JSONB DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'error', -- 'warning', 'error', 'critical'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for error analysis
CREATE INDEX IF NOT EXISTS error_logs_source_idx ON public.error_logs (source);
CREATE INDEX IF NOT EXISTS error_logs_error_type_idx ON public.error_logs (error_type);
CREATE INDEX IF NOT EXISTS error_logs_user_id_idx ON public.error_logs (user_id);
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_correlation_id_idx ON public.error_logs (correlation_id);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON public.error_logs (severity) WHERE severity IN ('error', 'critical');

COMMENT ON TABLE public.error_logs IS 'Centralized error logging for reliability monitoring';
COMMENT ON COLUMN public.error_logs.source IS 'Origin: frontend, edge_function, database';
COMMENT ON COLUMN public.error_logs.correlation_id IS 'Request correlation ID for distributed tracing';

-- ============================================================================
-- 3. PROFILE COLUMNS FOR JOURNEY TRACKING
-- ============================================================================

-- Add onboarding timestamps
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Add availability flag for players
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS open_to_opportunities BOOLEAN NOT NULL DEFAULT false;

-- Add last activity tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.onboarding_started_at IS 'Timestamp when user began onboarding flow';
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 'Timestamp when user completed onboarding';
COMMENT ON COLUMN public.profiles.open_to_opportunities IS 'Whether player/coach is actively seeking opportunities';
COMMENT ON COLUMN public.profiles.last_active_at IS 'Last meaningful user activity timestamp';

-- ============================================================================
-- 4. TRIGGER: Auto-set onboarding_completed_at
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_onboarding_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Set completed_at when onboarding transitions to true
  IF OLD.onboarding_completed = false AND NEW.onboarding_completed = true THEN
    NEW.onboarding_completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_onboarding_timestamp ON public.profiles;
CREATE TRIGGER profiles_onboarding_timestamp
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_onboarding_timestamps();

-- ============================================================================
-- 5. RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- Events table: Only admins can read, authenticated users can insert their own
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all events"
  ON public.events FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Users can insert own events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Error logs table: Only admins can read/write
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all error logs"
  ON public.error_logs FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "Service role can insert error logs"
  ON public.error_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Authenticated can insert error logs"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================================================
-- 6. HELPER FUNCTION: Track Event
-- ============================================================================
CREATE OR REPLACE FUNCTION public.track_event(
  p_event_name TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_properties JSONB DEFAULT '{}'::jsonb,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_event_id UUID;
BEGIN
  -- Get current user info
  v_user_id := auth.uid();
  
  IF v_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  END IF;
  
  INSERT INTO events (
    event_name,
    user_id,
    role,
    entity_type,
    entity_id,
    properties,
    error_code,
    error_message
  ) VALUES (
    p_event_name,
    v_user_id,
    v_role,
    p_entity_type,
    p_entity_id,
    p_properties,
    p_error_code,
    p_error_message
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_event TO authenticated;

COMMENT ON FUNCTION public.track_event IS 'Track an analytics event for the current user';

-- ============================================================================
-- 7. HELPER FUNCTION: Log Error
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_error(
  p_source TEXT,
  p_error_type TEXT,
  p_error_message TEXT,
  p_function_name TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_correlation_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_severity TEXT DEFAULT 'error'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_id UUID;
BEGIN
  INSERT INTO error_logs (
    source,
    function_name,
    error_type,
    error_code,
    error_message,
    stack_trace,
    user_id,
    correlation_id,
    metadata,
    severity
  ) VALUES (
    p_source,
    p_function_name,
    p_error_type,
    p_error_code,
    p_error_message,
    p_stack_trace,
    auth.uid(),
    p_correlation_id,
    p_metadata,
    p_severity
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_error TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_error TO service_role;

COMMENT ON FUNCTION public.log_error IS 'Log an error for reliability monitoring';
