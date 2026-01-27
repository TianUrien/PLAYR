// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  ApplicationPayload,
  ApplicantData,
  VacancyData,
  ClubData,
  createLogger,
  generateEmailHtml,
  generateEmailText,
  sendEmail,
} from '../_shared/application-email.ts'

/**
 * ============================================================================
 * REAL MODE Application Notification Edge Function
 * ============================================================================
 * 
 * ISOLATION: This function handles PRODUCTION traffic only.
 * 
 * Purpose:
 * - Sends application notification emails to REAL clubs
 * - Triggered when a player applies to a vacancy
 * - Notifies the club that owns the vacancy
 * - Uses identical email template as test mode
 * 
 * Safety guarantees:
 * 1. Only processes applications where the applicant is NOT a test account
 * 2. Only sends to clubs that are NOT test accounts
 * 3. Test accounts will NEVER be processed by this function
 * 
 * Webhook configuration:
 * - Create a webhook pointing to this function
 * - Trigger on: INSERT on opportunity_applications table
 * - This function will filter out test accounts
 * 
 * The TEST mode function (notify-test-application) handles test traffic.
 * ============================================================================
 */

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger('NOTIFY_APPLICATION', correlationId)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    logger.info('=== REAL MODE: Received webhook request ===')

    // Get environment variables
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

    // Parse the webhook payload
    const payload: ApplicationPayload = await req.json()
    logger.info('Parsed payload', { 
      type: payload.type, 
      table: payload.table,
      applicationId: payload.record?.id,
      vacancyId: payload.record?.vacancy_id,
      playerId: payload.record?.player_id,
    })

    // Validate this is an opportunity_applications INSERT event
    if (payload.table !== 'opportunity_applications') {
      logger.info('Ignoring non-application event')
      return new Response(
        JSON.stringify({ message: 'Ignored - not an application event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only process INSERT events (new applications)
    if (payload.type !== 'INSERT') {
      logger.info('Ignoring non-INSERT event', { type: payload.type })
      return new Response(
        JSON.stringify({ message: 'Ignored - not a new application' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const application = payload.record
    logger.info('New application detected', {
      applicationId: application.id,
      vacancyId: application.vacancy_id,
      playerId: application.player_id,
    })

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the opportunity details
    const { data: vacancy, error: vacancyError } = await supabase
      .from('opportunities')
      .select('id, title, club_id')
      .eq('id', application.vacancy_id)
      .single()

    if (vacancyError || !vacancy) {
      logger.error('Failed to fetch vacancy', { error: vacancyError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch vacancy' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Fetched vacancy', { vacancyId: vacancy.id, title: vacancy.title, clubId: vacancy.club_id })

    // Fetch the applicant profile
    const { data: applicant, error: applicantError } = await supabase
      .from('profiles')
      .select('id, username, full_name, position, secondary_position, base_location, avatar_url, is_test_account')
      .eq('id', application.player_id)
      .single()

    if (applicantError || !applicant) {
      logger.error('Failed to fetch applicant profile', { error: applicantError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch applicant profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Fetched applicant', { 
      applicantId: applicant.id, 
      name: applicant.full_name,
      isTestAccount: applicant.is_test_account 
    })

    // ==========================================================================
    // CRITICAL SAFETY CHECK: Skip TEST accounts
    // This ensures REAL MODE never processes test accounts
    // ==========================================================================
    if (applicant.is_test_account) {
      logger.info('Ignoring application from TEST applicant (correct behavior)', { 
        applicantId: applicant.id,
        isTestAccount: true 
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - applicant is a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch the club profile (recipient)
    const { data: club, error: clubError } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_test_account, notify_applications')
      .eq('id', vacancy.club_id)
      .single()

    if (clubError || !club) {
      logger.error('Failed to fetch club profile', { error: clubError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch club profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Fetched club', { 
      clubId: club.id, 
      name: club.full_name,
      isTestAccount: club.is_test_account,
      notifyApplications: club.notify_applications
    })

    // ==========================================================================
    // CRITICAL SAFETY CHECK: Skip TEST club accounts
    // This ensures REAL MODE never sends to test clubs
    // ==========================================================================
    if (club.is_test_account) {
      logger.info('Ignoring application to TEST club (correct behavior)', { 
        clubId: club.id,
        isTestAccount: true 
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - club is a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ==========================================================================
    // CHECK NOTIFICATION PREFERENCE
    // Respect the club's notification preferences
    // ==========================================================================
    if (club.notify_applications === false) {
      logger.info('Club has disabled application notifications', { 
        clubId: club.id,
        notifyApplications: false
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - club has disabled application notifications' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Both applicant and club are REAL accounts - proceeding with email')

    // Generate email content
    const emailHtml = generateEmailHtml(applicant as ApplicantData, vacancy as VacancyData)
    const emailText = generateEmailText(applicant as ApplicantData, vacancy as VacancyData)
    const subject = `New application for "${vacancy.title}"`

    // Send email to the club
    const result = await sendEmail(
      resendApiKey,
      club.email,
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

    logger.info('=== REAL MODE: Email sent successfully ===', {
      recipient: club.email,
      subject,
      applicantName: applicant.full_name,
      vacancyTitle: vacancy.title,
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Application notification email sent',
        recipient: club.email,
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
