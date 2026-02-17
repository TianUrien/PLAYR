// deno-lint-ignore-file no-explicit-any
// NOTE: This file runs on Supabase Edge Functions (Deno runtime).
declare const Deno: {
  env: { get(key: string): string | undefined }
  serve: (handler: (req: Request) => Response | Promise<Response>) => void
}

// @ts-expect-error Deno URL imports are resolved at runtime in Supabase Edge Functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { renderTemplate } from '../_shared/email-renderer.ts'
import { sendTrackedBatch, createLogger } from '../_shared/email-sender.ts'

/**
 * Admin Send Campaign
 *
 * Sends an email campaign to the filtered audience.
 * Validates that the campaign is in 'draft' status, renders the template,
 * queries recipients based on audience_filter, and sends via batch API.
 *
 * Request body:
 *   campaign_id: UUID - the campaign to send
 *
 * Security: Validates JWT and checks is_platform_admin()
 */

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = getCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger('SEND-CAMPAIGN', correlationId)

  try {
    // ========================================================================
    // Auth check
    // ========================================================================
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    const { data: isAdmin } = await userClient.rpc('is_platform_admin')
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    // ========================================================================
    // Parse request
    // ========================================================================
    const body = await req.json()
    const { campaign_id } = body

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'campaign_id is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    // ========================================================================
    // Fetch campaign — must be 'draft'
    // ========================================================================
    const { data: campaign, error: campaignError } = await serviceClient
      .from('email_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (campaignError || !campaign) {
      return new Response(
        JSON.stringify({ success: false, error: 'Campaign not found' }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    if (campaign.status !== 'draft') {
      return new Response(
        JSON.stringify({ success: false, error: `Campaign is already "${campaign.status}", only draft campaigns can be sent` }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Starting campaign send', {
      campaignId: campaign_id,
      campaignName: campaign.name,
      templateKey: campaign.template_key,
      adminId: user.id,
    })

    // ========================================================================
    // Set status to 'sending'
    // ========================================================================
    await serviceClient.rpc('admin_update_campaign_status', {
      p_campaign_id: campaign_id,
      p_status: 'sending',
      p_sent_count: 0,
    })

    // ========================================================================
    // Render template
    // ========================================================================
    const rendered = await renderTemplate(serviceClient, campaign.template_key, {})
    if (!rendered) {
      await serviceClient.rpc('admin_update_campaign_status', {
        p_campaign_id: campaign_id,
        p_status: 'failed',
        p_sent_count: 0,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to render template' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    // ========================================================================
    // Query recipients
    // ========================================================================
    const audienceFilter = campaign.audience_filter || {}
    const filterRole = audienceFilter.role || null
    const filterCountry = audienceFilter.country || null

    let recipientQuery = serviceClient
      .from('profiles')
      .select('id, email, full_name, role, nationality_country_id, countries!profiles_nationality_country_id_fkey(code, name)')
      .not('email', 'is', null)
      .neq('email', '')
      .eq('is_blocked', false)
      .eq('is_test_account', false)

    if (filterRole) {
      recipientQuery = recipientQuery.eq('role', filterRole)
    }

    const { data: recipientData, error: recipientError } = await recipientQuery

    if (recipientError) {
      logger.error('Failed to query recipients', { error: recipientError.message })
      await serviceClient.rpc('admin_update_campaign_status', {
        p_campaign_id: campaign_id,
        p_status: 'failed',
        p_sent_count: 0,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to query recipients' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    // Apply country filter client-side (join filtering)
    let recipients = (recipientData || []).map((r: any) => ({
      email: r.email as string,
      recipientId: r.id as string,
      recipientRole: r.role as string,
      recipientCountry: r.countries?.code || null,
      countryCode: r.countries?.code || null,
    }))

    if (filterCountry) {
      recipients = recipients.filter(r => r.countryCode === filterCountry)
    }

    if (recipients.length === 0) {
      logger.warn('No recipients found for campaign', { campaignId: campaign_id })
      await serviceClient.rpc('admin_update_campaign_status', {
        p_campaign_id: campaign_id,
        p_status: 'sent',
        p_sent_count: 0,
      })
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No recipients matched the audience filter' }),
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Recipients found', { count: recipients.length })

    // ========================================================================
    // Send via batch
    // ========================================================================
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      await serviceClient.rpc('admin_update_campaign_status', {
        p_campaign_id: campaign_id,
        p_status: 'failed',
        p_sent_count: 0,
      })
      return new Response(
        JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
      )
    }

    const batchResult = await sendTrackedBatch({
      supabase: serviceClient,
      resendApiKey,
      recipients: recipients.map(r => ({
        email: r.email,
        recipientId: r.recipientId,
        recipientRole: r.recipientRole,
        recipientCountry: r.recipientCountry,
      })),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateKey: campaign.template_key,
      campaignId: campaign_id,
      logger,
    })

    // ========================================================================
    // Update campaign status
    // ========================================================================
    const finalStatus = batchResult.stats.failed > 0 && batchResult.stats.sent === 0 ? 'failed' : 'sent'
    await serviceClient.rpc('admin_update_campaign_status', {
      p_campaign_id: campaign_id,
      p_status: finalStatus,
      p_sent_count: batchResult.stats.sent,
    })

    logger.info('Campaign send complete', {
      campaignId: campaign_id,
      status: finalStatus,
      sent: batchResult.stats.sent,
      failed: batchResult.stats.failed,
      durationMs: batchResult.stats.durationMs,
    })

    return new Response(
      JSON.stringify({
        success: true,
        sent: batchResult.stats.sent,
        failed: batchResult.stats.failed,
        duration_ms: batchResult.stats.durationMs,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    logger.error('Campaign send handler error', {
      error: error instanceof Error ? error.message : 'Unknown',
    })
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } }
    )
  }
})
