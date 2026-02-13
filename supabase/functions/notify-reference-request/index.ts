// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  ReferenceRequestPayload,
  RequesterData,
  RecipientData,
  createLogger,
  generateEmailHtml,
  generateEmailText,
  sendEmail,
} from '../_shared/reference-request-email.ts'

/**
 * ============================================================================
 * Reference Request Notification Edge Function
 * ============================================================================
 *
 * Purpose:
 * - Sends email notification when a user requests a reference
 * - Triggered on INSERT to profile_references with status='pending'
 * - Notifies the person asked to write the reference (reference_id)
 *
 * Safety guarantees:
 * 1. Checks is_test_account on BOTH requester and recipient
 * 2. Respects recipient's notify_references preference
 * 3. Only processes INSERT events with status='pending'
 *
 * Webhook configuration:
 * - Trigger on: INSERT on profile_references table
 * ============================================================================
 */

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger('NOTIFY_REFERENCE_REQUEST', correlationId)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    logger.info('=== Received webhook request ===')

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!resendApiKey) {
      logger.error('RESEND_API_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.error('Supabase credentials not configured')
      return new Response(
        JSON.stringify({ error: 'Supabase credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const payload: ReferenceRequestPayload = await req.json()
    logger.info('Parsed payload', {
      type: payload.type,
      table: payload.table,
      referenceId: payload.record?.id,
      requesterId: payload.record?.requester_id,
      referenceWriterId: payload.record?.reference_id,
      status: payload.record?.status,
    })

    // Only process profile_references events
    if (payload.table !== 'profile_references') {
      logger.info('Ignoring non-reference event')
      return new Response(
        JSON.stringify({ message: 'Ignored - not a reference event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only process INSERT events (new reference requests)
    if (payload.type !== 'INSERT') {
      logger.info('Ignoring non-INSERT event', { type: payload.type })
      return new Response(
        JSON.stringify({ message: 'Ignored - not a new reference request' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only process pending requests
    if (payload.record.status !== 'pending') {
      logger.info('Ignoring non-pending reference', { status: payload.record.status })
      return new Response(
        JSON.stringify({ message: 'Ignored - not a pending reference request' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const reference = payload.record

    logger.info('Reference request detected', {
      referenceRecordId: reference.id,
      requesterId: reference.requester_id,
      referenceWriterId: reference.reference_id,
      relationshipType: reference.relationship_type,
    })

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch requester profile
    const { data: requester, error: requesterError } = await supabase
      .from('profiles')
      .select('id, username, full_name, base_location, avatar_url, is_test_account')
      .eq('id', reference.requester_id)
      .single()

    if (requesterError || !requester) {
      logger.error('Failed to fetch requester profile', { error: requesterError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch requester profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Fetched requester', {
      requesterId: requester.id,
      name: requester.full_name,
      isTestAccount: requester.is_test_account,
    })

    // Skip test accounts
    if (requester.is_test_account) {
      logger.info('Ignoring reference request from test account', {
        requesterId: requester.id,
        isTestAccount: true,
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - requester is a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch recipient profile (the person asked to write the reference)
    const { data: recipient, error: recipientError } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_test_account, notify_references')
      .eq('id', reference.reference_id)
      .single()

    if (recipientError || !recipient) {
      logger.error('Failed to fetch recipient profile', { error: recipientError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch recipient profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Fetched recipient (reference writer)', {
      recipientId: recipient.id,
      name: recipient.full_name,
      isTestAccount: recipient.is_test_account,
      notifyReferences: recipient.notify_references,
    })

    // Skip test accounts
    if (recipient.is_test_account) {
      logger.info('Ignoring reference request to test account', {
        recipientId: recipient.id,
        isTestAccount: true,
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - recipient is a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check notification preference
    if (recipient.notify_references === false) {
      logger.info('Recipient has disabled reference request notifications', {
        recipientId: recipient.id,
        notifyReferences: false,
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - recipient has disabled reference request notifications' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Both accounts are real - proceeding with email')

    const emailHtml = generateEmailHtml(
      requester as RequesterData,
      reference.relationship_type,
      reference.request_note
    )
    const emailText = generateEmailText(
      requester as RequesterData,
      reference.relationship_type,
      reference.request_note
    )
    const requesterName = requester.full_name?.trim() || 'Someone'
    const subject = `${requesterName} requested a reference on PLAYR`

    const result = await sendEmail(
      resendApiKey,
      recipient.email,
      subject,
      emailHtml,
      emailText,
      logger
    )

    if (!result.success) {
      logger.error('Failed to send email', { error: result.error })
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: result.error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('=== Email sent successfully ===', {
      recipient: recipient.email,
      subject,
      requesterName: requester.full_name,
      relationshipType: reference.relationship_type,
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reference request notification email sent',
        recipient: recipient.email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Unhandled error', { error: errorMessage })
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
