// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

/**
 * TEST MODE Vacancy Notification Edge Function
 * 
 * Sends email notifications via Resend when a TEST club creates a new vacancy.
 * This is strictly for testing - only hardcoded test recipients receive emails.
 * 
 * Safety guarantees:
 * - Recipients are HARDCODED (no database lookup for recipients)
 * - Only processes vacancies from test accounts (is_test_account = true)
 * - Clear [TEST] prefix in subject line
 * - Disclaimer footer in email body
 */

// Hardcoded test recipients - ONLY these emails will ever receive notifications
const TEST_RECIPIENTS = [
  'playrplayer93@gmail.com',  // test player
  'coachplayr@gmail.com',     // test coach
]

const RESEND_API_URL = 'https://api.resend.com/emails'
const SENDER_EMAIL = 'Tian from PLAYR <team@oplayr.com>'
const PLAYR_BASE_URL = 'https://oplayr.com' // Update if different

interface VacancyPayload {
  type: 'INSERT' | 'UPDATE'
  table: 'vacancies'
  schema: 'public'
  record: {
    id: string
    club_id: string
    title: string
    position: string | null
    location_city: string
    location_country: string
    description: string | null
    status: string
    opportunity_type: string
  }
  old_record: {
    id: string
    club_id: string
    title: string
    position: string | null
    location_city: string
    location_country: string
    description: string | null
    status: string
    opportunity_type: string
  } | null
}

interface ClubProfile {
  id: string
  full_name: string | null
  is_test_account: boolean
}

const createLogger = (correlationId: string) => ({
  info: (message: string, meta?: Record<string, unknown>) => 
    console.log(`[NOTIFY_TEST_VACANCY][${correlationId}] ${message}`, meta ?? ''),
  warn: (message: string, meta?: Record<string, unknown>) => 
    console.warn(`[NOTIFY_TEST_VACANCY][${correlationId}] ${message}`, meta ?? ''),
  error: (message: string, meta?: Record<string, unknown>) => 
    console.error(`[NOTIFY_TEST_VACANCY][${correlationId}] ${message}`, meta ?? ''),
})

function generateEmailHtml(vacancy: VacancyPayload['record'], clubName: string): string {
  // Safe field extraction with fallbacks
  const position = vacancy.position 
    ? vacancy.position.charAt(0).toUpperCase() + vacancy.position.slice(1) 
    : null
  
  // Build location string, handling missing city or country
  const city = vacancy.location_city?.trim() || null
  const country = vacancy.location_country?.trim() || null
  const location = city && country 
    ? `${city}, ${country}` 
    : city || country || null
  
  const summary = vacancy.description?.trim()?.slice(0, 200) || null
  const hasMoreSummary = vacancy.description && vacancy.description.length > 200
  const vacancyUrl = `${PLAYR_BASE_URL}/opportunities/${vacancy.id}`
  const safeClubName = clubName?.trim() || 'A club'

  // Build table rows conditionally
  const tableRows: string[] = []
  
  tableRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #6b7280; width: 100px;">Club:</td>
        <td style="padding: 8px 0; color: #1f2937; font-weight: 500;">${safeClubName}</td>
      </tr>`)
  
  if (position) {
    tableRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Position:</td>
        <td style="padding: 8px 0; color: #1f2937; font-weight: 500;">${position}</td>
      </tr>`)
  }
  
  if (location) {
    tableRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #6b7280;">Location:</td>
        <td style="padding: 8px 0; color: #1f2937; font-weight: 500;">${location}</td>
      </tr>`)
  }
  
  if (summary) {
    tableRows.push(`
      <tr>
        <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">Summary:</td>
        <td style="padding: 8px 0; color: #1f2937;">${summary}${hasMoreSummary ? '...' : ''}</td>
      </tr>`)
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Test Vacancy on PLAYR</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <img src="https://xtertgftujnebubxgqit.supabase.co/storage/v1/object/public/email-assets/playr-logo-white.png" alt="PLAYR" style="height: 40px; width: auto;" />
    <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">The Home of Field Hockey</p>
  </div>
  
  <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
      <strong style="color: #92400e;">⚠️ TEST MODE</strong>
      <p style="color: #92400e; margin: 4px 0 0 0; font-size: 14px;">This is a test notification. No real users are receiving this email.</p>
    </div>

    <h2 style="color: #1f2937; margin: 0 0 16px 0;">A new TEST vacancy has been created on PLAYR</h2>
    
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">${tableRows.join('')}
    </table>

    <a href="${vacancyUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
      View Test Vacancy →
    </a>
    
    <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
      Click the link above to view this test vacancy and try the application flow.
    </p>
  </div>
  
  <div style="background: #f3f4f6; padding: 16px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">
      (This is a TEST notification. No real users are receiving this email.)
    </p>
  </div>
</body>
</html>
  `.trim()
}

function generateEmailText(vacancy: VacancyPayload['record'], clubName: string): string {
  // Safe field extraction with fallbacks
  const position = vacancy.position 
    ? vacancy.position.charAt(0).toUpperCase() + vacancy.position.slice(1) 
    : null
  
  // Build location string, handling missing city or country
  const city = vacancy.location_city?.trim() || null
  const country = vacancy.location_country?.trim() || null
  const location = city && country 
    ? `${city}, ${country}` 
    : city || country || null
  
  const summary = vacancy.description?.trim()?.slice(0, 200) || null
  const hasMoreSummary = vacancy.description && vacancy.description.length > 200
  const vacancyUrl = `${PLAYR_BASE_URL}/opportunities/${vacancy.id}`
  const safeClubName = clubName?.trim() || 'A club'

  // Build text lines conditionally
  const lines: string[] = [
    '[TEST MODE] A new TEST vacancy has been created on PLAYR.',
    '',
    `Club: ${safeClubName}`,
  ]
  
  if (position) {
    lines.push(`Position: ${position}`)
  }
  
  if (location) {
    lines.push(`Location: ${location}`)
  }
  
  if (summary) {
    lines.push(`Summary: ${summary}${hasMoreSummary ? '...' : ''}`)
  }
  
  lines.push(
    '',
    'Click the link below to view this test vacancy and try the application flow:',
    vacancyUrl,
    '',
    '(This is a TEST notification. No real users are receiving this email.)'
  )

  return lines.join('\n')
}

async function sendEmail(
  resendApiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  logger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: SENDER_EMAIL,
        to,
        subject,
        html,
        text,
      }),
    })

    if (!response.ok) {
      const errorData = await response.text()
      logger.error('Resend API error', { status: response.status, error: errorData, recipient: to })
      return { success: false, error: `Resend API error: ${response.status} - ${errorData}` }
    }

    const result = await response.json()
    logger.info('Email sent successfully', { emailId: result.id, recipient: to })
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to send email', { error: errorMessage, recipient: to })
    return { success: false, error: errorMessage }
  }
}

/**
 * Send emails individually to each recipient
 * Each user only sees their own email in the to: field
 */
async function sendEmailsIndividually(
  resendApiKey: string,
  recipients: string[],
  subject: string,
  html: string,
  text: string,
  logger: ReturnType<typeof createLogger>
): Promise<{ success: boolean; sent: string[]; failed: string[] }> {
  const sent: string[] = []
  const failed: string[] = []

  for (const recipient of recipients) {
    const result = await sendEmail(resendApiKey, recipient, subject, html, text, logger)
    if (result.success) {
      sent.push(recipient)
    } else {
      failed.push(recipient)
    }
  }

  return {
    success: failed.length === 0,
    sent,
    failed,
  }
}

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID().slice(0, 8)
  const logger = createLogger(correlationId)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    logger.info('Received webhook request')

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
      clubId: payload.record?.club_id 
    })

    // Validate this is a vacancy INSERT or UPDATE
    if (payload.table !== 'vacancies') {
      logger.info('Ignoring non-vacancy event')
      return new Response(
        JSON.stringify({ message: 'Ignored - not a vacancy event' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only send notification when vacancy becomes PUBLISHED (status = 'open')
    // Case 1: INSERT with status = 'open' (directly published)
    // Case 2: UPDATE where old status was not 'open' and new status is 'open'
    const vacancy = payload.record
    const isNewlyPublished = 
      (payload.type === 'INSERT' && vacancy.status === 'open') ||
      (payload.type === 'UPDATE' && vacancy.status === 'open' && payload.old_record?.status !== 'open')

    if (!isNewlyPublished) {
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
      previousStatus: payload.old_record?.status
    })

    // Create Supabase client to check if club is a test account
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

    // SAFETY CHECK: Only process test accounts
    if (!clubProfile.is_test_account) {
      logger.info('Ignoring vacancy from non-test account', { clubId: vacancy.club_id })
      return new Response(
        JSON.stringify({ message: 'Ignored - club is not a test account' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('Processing test vacancy notification', {
      vacancyId: vacancy.id,
      vacancyTitle: vacancy.title,
      clubName: clubProfile.full_name,
      isTestAccount: clubProfile.is_test_account,
    })

    // Generate email content
    const clubName = clubProfile.full_name || 'Unknown Club'
    const subject = `[TEST] New test vacancy on PLAYR: ${vacancy.title}`
    const html = generateEmailHtml(vacancy, clubName)
    const text = generateEmailText(vacancy, clubName)

    // Send email individually to each test recipient
    const emailResult = await sendEmailsIndividually(
      resendApiKey,
      TEST_RECIPIENTS,
      subject,
      html,
      text,
      logger
    )

    if (!emailResult.success) {
      logger.warn('Some emails failed to send', { 
        sent: emailResult.sent, 
        failed: emailResult.failed 
      })
    }

    logger.info('Test vacancy notification completed', {
      vacancyId: vacancy.id,
      sent: emailResult.sent,
      failed: emailResult.failed,
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test notifications sent individually',
        sent: emailResult.sent,
        failed: emailResult.failed,
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
