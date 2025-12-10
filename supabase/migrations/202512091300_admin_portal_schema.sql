-- ============================================================================
-- ADMIN PORTAL SCHEMA
-- ============================================================================
-- This migration adds infrastructure for the Admin Portal:
-- 1. Admin audit logs table for tracking all admin actions
-- 2. Additional profile columns for admin operations (is_blocked)
-- 3. RLS policies and security functions for admin operations
-- ============================================================================

SET search_path = public;

-- ============================================================================
-- PROFILE COLUMNS FOR ADMIN OPERATIONS
-- ============================================================================
-- Note: is_test_account already exists from 202511281000_test_account_infrastructure.sql
-- Note: is_admin check uses app_metadata from JWT (set via Supabase dashboard or Edge Function)

-- Add blocked account support
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS blocked_by UUID REFERENCES auth.users(id);

-- Index for efficient blocked user filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_blocked
ON public.profiles (is_blocked)
WHERE is_blocked = true;

COMMENT ON COLUMN public.profiles.is_blocked IS 'When true, user is blocked from accessing the platform';
COMMENT ON COLUMN public.profiles.blocked_at IS 'Timestamp when the user was blocked';
COMMENT ON COLUMN public.profiles.blocked_reason IS 'Admin-provided reason for blocking this user';
COMMENT ON COLUMN public.profiles.blocked_by IS 'Admin user who blocked this account';

-- ============================================================================
-- ADMIN AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id 
ON public.admin_audit_logs (admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target 
ON public.admin_audit_logs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action 
ON public.admin_audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at 
ON public.admin_audit_logs (created_at DESC);

COMMENT ON TABLE public.admin_audit_logs IS 'Immutable log of all admin actions for accountability and debugging';
COMMENT ON COLUMN public.admin_audit_logs.action IS 'Action performed: block_user, unblock_user, edit_profile, delete_profile, etc.';
COMMENT ON COLUMN public.admin_audit_logs.target_type IS 'Entity type: profile, vacancy, application, conversation, etc.';
COMMENT ON COLUMN public.admin_audit_logs.old_data IS 'JSON snapshot of entity state before the action';
COMMENT ON COLUMN public.admin_audit_logs.new_data IS 'JSON snapshot of entity state after the action';
COMMENT ON COLUMN public.admin_audit_logs.metadata IS 'Additional context: reason, notes, etc.';

-- Enable RLS
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR ADMIN AUDIT LOGS
-- ============================================================================
-- Admins can read audit logs
DROP POLICY IF EXISTS "Admins can read audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can read audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_platform_admin());

-- Admins can insert audit logs (done via RPC with SECURITY DEFINER)
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.is_platform_admin());

-- No one can update audit logs (immutable)
DROP POLICY IF EXISTS "No one can update audit logs" ON public.admin_audit_logs;
CREATE POLICY "No one can update audit logs"
ON public.admin_audit_logs FOR UPDATE
USING (false);

-- No one can delete audit logs (immutable)
DROP POLICY IF EXISTS "No one can delete audit logs" ON public.admin_audit_logs;
CREATE POLICY "No one can delete audit logs"
ON public.admin_audit_logs FOR DELETE
USING (false);

-- ============================================================================
-- HELPER FUNCTION: Log admin action
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_action TEXT,
  p_target_type TEXT,
  p_target_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Verify caller is admin
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  INSERT INTO public.admin_audit_logs (
    admin_id,
    action,
    target_type,
    target_id,
    old_data,
    new_data,
    metadata
  ) VALUES (
    auth.uid(),
    p_action,
    p_target_type,
    p_target_id,
    p_old_data,
    p_new_data,
    p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION public.admin_log_action IS 'Creates an immutable audit log entry for admin actions';

-- ============================================================================
-- ADMIN RLS POLICY FOR PROFILES (allow admins to view all)
-- ============================================================================
-- Drop existing admin policies if any
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (public.is_platform_admin());

-- Allow admins to update any profile (for blocking, etc.)
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
