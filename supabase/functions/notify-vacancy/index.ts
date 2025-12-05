// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  VacancyPayload,
  VacancyRecord,
  createLogger,
  generateEmailHtml,
  generateEmailText,
  sendEmailsIndividually,
  isVacancyNewlyPublished,
} from '../_shared/vacancy-email.ts'

/**
 * ============================================================================
 * REAL MODE Vacancy Notification Edge Function
 * ============================================================================
 * 
 * ISOLATION: This function is COMPLETELY ISOLATED from test traffic.
 * 
 * Purpose:
 * - Sends vacancy notification emails to REAL users (players/coaches)
 * - Triggered ONLY by vacancies from REAL accounts (is_test_account = false)
 * - Matches vacancy opportunity_type to user role (player/coach)
 * 
 * Safety guarantees:
 * 1. Only processes vacancies from NON-test accounts
 * 2. Never sends to test recipients or test accounts
 * 3. Only sends when vacancy is newly published (status becomes 'open')
 * 4. Recipients are queried from database based on role matching
 * 
 * Webhook configuration:
 * - Create a separate webhook pointing to this function
 * - Trigger on: INSERT, UPDATE on vacancies table
 * - This function will filter for real accounts only
 * 
 * The TEST mode function (notify-test-vacancy) handles test traffic.
 * ============================================================================
 */

// =============================================================================
// BLOCKED RECIPIENTS - These should NEVER receive production emails
// =============================================================================
const BLOCKED_TEST_RECIPIENTS = [
  'playrplayer93@gmail.com',
  'coachplayr@gmail.com',
]

interface ClubProfile {
  id: string
  full_name: string | null
  is_test_account: boolean
}

interface RecipientProfile {
  id: string
  email: string
  role: string
  is_test_account: boolean
  notify_opportunities: boolean
}

/**
 * Fetch eligible recipients based on vacancy opportunity type
 * - For 'player' vacancies: fetch players
 * - For 'coach' vacancies: fetch coaches
 * - Excludes test accounts
 * - Excludes users who opted out of opportunity notifications
 * - Excludes blocked test recipients
 */
async function fetchEligibleRecipients(
  supabase: any,
  vacancy: VacancyRecord,
  logger: ReturnType<typeof createLogger>
): Promise<string[]> {
  const targetRole = vacancy.opportunity_type // 'player' or 'coach'
  
  logger.info('Fetching eligible recipients', { 
    targetRole,
    vacancyId: vacancy.id 
  })

  // Query profiles matching the target role
  // - Must match role (player/coach)
  // - Must NOT be a test account
  // - Must have completed onboarding
  // - Must have a valid email
  // - Must have notify_opportunities = true (opted in to receive emails)
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_test_account, notify_opportunities')
    .eq('role', targetRole)
    .eq('is_test_account', false)
    .eq('onboarding_completed', true)
    .eq('notify_opportunities', true)
    .not('email', 'is', null)

  if (error) {
    logger.error('Failed to fetch recipient profiles', { error: error.message })
    return []
  }

  if (!profiles || profiles.length === 0) {
    logger.info('No eligible recipients found', { targetRole })
    return []
  }

  // Filter out blocked test recipients and extract emails
  const eligibleEmails = (profiles as RecipientProfile[])
    .filter(p => !BLOCKED_TEST_RECIPIENTS.includes(p.email.toLowerCase()))
    .map(p => p.email)

  logger.info('Found eligible recipients', { 
    totalFound: profiles.length,
    afterFiltering: eligibleEmails.length,
    targetRole 
  })

  return eligibleEmails
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger('NOTIFY_VACANCY', correlationId)

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
    const payload: VacancyPayload = await req.json()
    logger.info('Parsed payload', { 
      type: payload.type, 
      table: payload.table,
      vacancyId: payload.record?.id,
      clubId: payload.record?.club_id,
      opportunityType: payload.record?.opportunity_type
    })

    // Validate this is a vacancy event
    if (payload.table !== 'vacancies') {
      logger.info('Ignoring non-vacancy event')
      return new Response(
        JSON.stringify({ message: 'Ignored - not a vacancy event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if vacancy was newly published using shared utility
    const vacancy = payload.record
    if (!isVacancyNewlyPublished(payload)) {
      logger.info('Ignoring - vacancy not newly published', { 
        type: payload.type,
        currentStatus: vacancy.status,
        previousStatus: payload.old_record?.status 
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - vacancy not newly published' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Vacancy newly published', {
      type: payload.type,
      vacancyId: vacancy.id,
      status: vacancy.status,
      opportunityType: vacancy.opportunity_type,
      previousStatus: payload.old_record?.status
    })

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch the club profile to check is_test_account
    const { data: clubProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, is_test_account')
      .eq('id', vacancy.club_id)
      .single()

    if (profileError || !clubProfile) {
      logger.error('Failed to fetch club profile', { error: profileError?.message })
      return new Response(
        JSON.stringify({ error: 'Failed to fetch club profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ==========================================================================
    // CRITICAL SAFETY CHECK: Only process REAL (non-test) accounts
    // This ensures REAL MODE never processes test vacancies
    // ==========================================================================
    if (clubProfile.is_test_account) {
      logger.info('Ignoring vacancy from TEST account (correct behavior)', { 
        clubId: vacancy.club_id,
        isTestAccount: true 
      })
      return new Response(
        JSON.stringify({ message: 'Ignored - club is a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Processing REAL vacancy notification', {
      vacancyId: vacancy.id,
      vacancyTitle: vacancy.title,
      clubName: clubProfile.full_name,
      opportunityType: vacancy.opportunity_type,
      isTestAccount: false,
    })

    // Fetch eligible recipients based on vacancy type
    const recipients = await fetchEligibleRecipients(supabase, vacancy, logger)

    if (recipients.length === 0) {
      logger.info('No eligible recipients found - skipping email send')
      return new Response(
        JSON.stringify({ 
          success: true, 
          mode: 'REAL',
          message: 'No eligible recipients found',
          sent: [],
          failed: [],
          vacancyId: vacancy.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate email content (using shared template - identical to test mode)
    const clubName = clubProfile.full_name || 'Unknown Club'
    const subject = `New opportunity on PLAYR: ${vacancy.title}`
    const html = generateEmailHtml(vacancy, clubName)
    const text = generateEmailText(vacancy, clubName)

    // ==========================================================================
    // SEND TO REAL USERS ONLY
    // Recipients are filtered to exclude test accounts and blocked emails
    // Using parallel batched sending for performance
    // ==========================================================================
    logger.info('Sending to real recipients', { 
      recipientCount: recipients.length,
      opportunityType: vacancy.opportunity_type 
    })

    const emailResult = await sendEmailsIndividually(
      resendApiKey,
      recipients,
      subject,
      html,
      text,
      logger
    )

    if (!emailResult.success) {
      logger.warn('Some emails failed to send', { 
        sent: emailResult.sent.length, 
        failed: emailResult.failed.length,
        failedEmails: emailResult.failed.slice(0, 10), // Log first 10 for debugging
      })
    }

    logger.info('=== REAL MODE: Notification completed ===', {
      vacancyId: vacancy.id,
      sentCount: emailResult.sent.length,
      failedCount: emailResult.failed.length,
      durationMs: emailResult.stats.durationMs,
      avgTimePerEmail: emailResult.stats.avgTimePerEmail,
      batchApiCalls: emailResult.stats.batchApiCalls,
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        mode: 'REAL',
        message: 'Production notifications sent via Batch API',
        sentCount: emailResult.sent.length,
        failedCount: emailResult.failed.length,
        stats: emailResult.stats,
        vacancyId: vacancy.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Unexpected error', { error: errorMessage })
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
