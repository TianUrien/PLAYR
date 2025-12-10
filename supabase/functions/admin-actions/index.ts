// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface AdminActionRequest {
  action: 'delete_auth_user' | 'set_admin_status'
  target_id: string
  params?: Record<string, any>
}

interface AdminActionResponse {
  success: boolean
  error?: string
  data?: any
}

const createLogger = (correlationId: string) => ({
  info: (message: string, meta?: Record<string, unknown>) => 
    console.log(`[ADMIN_ACTIONS][${correlationId}] ${message}`, meta ?? ''),
  warn: (message: string, meta?: Record<string, unknown>) => 
    console.warn(`[ADMIN_ACTIONS][${correlationId}] ${message}`, meta ?? ''),
  error: (message: string, meta?: Record<string, unknown>) => 
    console.error(`[ADMIN_ACTIONS][${correlationId}] ${message}`, meta ?? ''),
})

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger(correlationId)
  const startTime = Date.now()

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.slice(7)

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client to verify the caller
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    // Service role client for admin operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify the caller is authenticated
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (authError || !user) {
      logger.error('Authentication failed', { error: authError?.message })
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the caller is an admin
    const { data: isAdmin, error: adminCheckError } = await userClient.rpc('is_platform_admin')
    if (adminCheckError || !isAdmin) {
      logger.error('Admin check failed', { userId: user.id, isAdmin, error: adminCheckError?.message })
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Admin authenticated', { adminId: user.id })

    // Parse request body
    const body: AdminActionRequest = await req.json()
    const { action, target_id, params } = body

    if (!action || !target_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: action, target_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let result: AdminActionResponse

    switch (action) {
      case 'delete_auth_user': {
        logger.info('Deleting auth user', { targetId: target_id })
        
        // First check if the user exists
        const { data: targetUser, error: fetchError } = await adminClient.auth.admin.getUserById(target_id)
        if (fetchError || !targetUser) {
          logger.warn('Target user not found', { targetId: target_id })
          result = { success: false, error: 'User not found' }
          break
        }

        // Delete the user
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(target_id)
        if (deleteError) {
          logger.error('Failed to delete user', { targetId: target_id, error: deleteError.message })
          result = { success: false, error: deleteError.message }
          break
        }

        // Log the action
        await userClient.rpc('admin_log_action', {
          p_action: 'delete_auth_user',
          p_target_type: 'auth_user',
          p_target_id: target_id,
          p_old_data: {
            email: targetUser.user.email,
            created_at: targetUser.user.created_at,
          },
          p_new_data: null,
          p_metadata: { reason: params?.reason ?? 'Orphan cleanup' },
        })

        logger.info('Auth user deleted successfully', { targetId: target_id })
        result = { 
          success: true, 
          data: { 
            deleted_user_id: target_id,
            email: targetUser.user.email 
          } 
        }
        break
      }

      case 'set_admin_status': {
        const isAdmin = params?.is_admin ?? false
        logger.info('Setting admin status', { targetId: target_id, isAdmin })

        // Update user's app_metadata
        const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
          target_id,
          { app_metadata: { is_admin: isAdmin } }
        )

        if (updateError) {
          logger.error('Failed to update admin status', { targetId: target_id, error: updateError.message })
          result = { success: false, error: updateError.message }
          break
        }

        // Log the action
        await userClient.rpc('admin_log_action', {
          p_action: isAdmin ? 'grant_admin' : 'revoke_admin',
          p_target_type: 'auth_user',
          p_target_id: target_id,
          p_old_data: null,
          p_new_data: { is_admin: isAdmin },
          p_metadata: { reason: params?.reason },
        })

        logger.info('Admin status updated successfully', { targetId: target_id, isAdmin })
        result = { 
          success: true, 
          data: { 
            user_id: target_id,
            is_admin: isAdmin,
            email: updatedUser.user.email
          } 
        }
        break
      }

      default:
        result = { success: false, error: `Unknown action: ${action}` }
    }

    const durationMs = Date.now() - startTime
    logger.info('Request completed', { action, durationMs, success: result.success })

    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Unhandled error', { error: errorMessage })

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
