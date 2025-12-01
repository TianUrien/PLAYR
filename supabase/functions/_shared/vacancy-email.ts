/**
 * Shared Email Template for Vacancy Notifications
 * 
 * This module contains the email generation functions used by both
 * TEST and REAL vacancy notification Edge Functions.
 * 
 * IMPORTANT: Both functions use IDENTICAL email templates.
 * Only the recipient routing logic differs.
 */

export const RESEND_API_URL = 'https://api.resend.com/emails'
export const SENDER_EMAIL = 'PLAYR Hockey <team@oplayr.com>'
export const PLAYR_BASE_URL = 'https://oplayr.com'

export interface VacancyRecord {
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

export interface VacancyPayload {
  type: 'INSERT' | 'UPDATE'
  table: 'vacancies'
  schema: 'public'
  record: VacancyRecord
  old_record: VacancyRecord | null
}

export function generateEmailHtml(vacancy: VacancyRecord, clubName: string): string {
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

  // Build details section conditionally
  const detailItems: string[] = []
  
  if (position) {
    detailItems.push(`<span style="display: inline-block; background: #f3f4f6; padding: 4px 12px; border-radius: 16px; font-size: 14px; color: #374151; margin-right: 8px; margin-bottom: 8px;">${position}</span>`)
  }
  
  if (location) {
    detailItems.push(`<span style="display: inline-block; background: #f3f4f6; padding: 4px 12px; border-radius: 16px; font-size: 14px; color: #374151; margin-right: 8px; margin-bottom: 8px;">📍 ${location}</span>`)
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Opportunity on PLAYR</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
  
  <!-- Header -->
  <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px 24px; border-radius: 16px 16px 0 0; text-align: center;">
    <img src="https://xtertgftujnebubxgqit.supabase.co/storage/v1/object/public/email-assets/playr-logo-white.png" alt="PLAYR" style="height: 36px; width: auto;" />
  </div>
  
  <!-- Main Content -->
  <div style="background: #ffffff; padding: 32px 24px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
    
    <h1 style="color: #1f2937; margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">New Opportunity Available! 🏑</h1>
    <p style="color: #6b7280; margin: 0 0 24px 0; font-size: 16px;">A club has just published a new opportunity.</p>
    
    <!-- Vacancy Card -->
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
      <h2 style="color: #1f2937; margin: 0 0 4px 0; font-size: 20px; font-weight: 600;">${vacancy.title}</h2>
      <p style="color: #6366f1; margin: 0 0 16px 0; font-size: 15px; font-weight: 500;">${safeClubName}</p>
      
      ${detailItems.length > 0 ? `<div style="margin-bottom: 16px;">${detailItems.join('')}</div>` : ''}
      
      ${summary ? `<p style="color: #4b5563; margin: 0; font-size: 14px; line-height: 1.6;">${summary}${hasMoreSummary ? '...' : ''}</p>` : ''}
    </div>
    
    <!-- CTA Button -->
    <div style="text-align: center;">
      <a href="${vacancyUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        View Opportunity
      </a>
    </div>
    
    <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0 0; text-align: center;">
      Don't miss out – great opportunities go fast!
    </p>
  </div>
  
  <!-- Footer -->
  <div style="background: #f3f4f6; padding: 24px; border-radius: 0 0 16px 16px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
    <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0;">
      You're receiving this because you're on PLAYR.
    </p>
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      <a href="${PLAYR_BASE_URL}/settings" style="color: #6366f1; text-decoration: none;">Manage notification preferences</a>
    </p>
  </div>
  
</body>
</html>
  `.trim()
}

export function generateEmailText(vacancy: VacancyRecord, clubName: string): string {
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

  // Build text content
  const lines: string[] = [
    'New Opportunity Available on PLAYR! 🏑',
    '',
    'A club has just published a new opportunity.',
    '',
    `${vacancy.title}`,
    `${safeClubName}`,
  ]
  
  if (position) {
    lines.push(`Position: ${position}`)
  }
  
  if (location) {
    lines.push(`Location: ${location}`)
  }
  
  if (summary) {
    lines.push('')
    lines.push(`${summary}${hasMoreSummary ? '...' : ''}`)
  }
  
  lines.push(
    '',
    'View this opportunity:',
    vacancyUrl,
    '',
    "Don't miss out – great opportunities go fast!",
    '',
    '---',
    "You're receiving this because you're on PLAYR.",
    `Manage preferences: ${PLAYR_BASE_URL}/settings`
  )

  return lines.join('\n')
}

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export function createLogger(prefix: string, correlationId: string): Logger {
  return {
    info: (message: string, meta?: Record<string, unknown>) => 
      console.log(`[${prefix}][${correlationId}] ${message}`, meta ?? ''),
    warn: (message: string, meta?: Record<string, unknown>) => 
      console.warn(`[${prefix}][${correlationId}] ${message}`, meta ?? ''),
    error: (message: string, meta?: Record<string, unknown>) => 
      console.error(`[${prefix}][${correlationId}] ${message}`, meta ?? ''),
  }
}

export async function sendEmail(
  resendApiKey: string,
  to: string,
  subject: string,
  html: string,
  text: string,
  logger: Logger
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
export async function sendEmailsIndividually(
  resendApiKey: string,
  recipients: string[],
  subject: string,
  html: string,
  text: string,
  logger: Logger
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

/**
 * Check if a vacancy was just published (status changed to 'open')
 */
export function isVacancyNewlyPublished(payload: VacancyPayload): boolean {
  const vacancy = payload.record
  
  // Case 1: INSERT with status = 'open' (directly published)
  if (payload.type === 'INSERT' && vacancy.status === 'open') {
    return true
  }
  
  // Case 2: UPDATE where old status was not 'open' and new status is 'open'
  if (payload.type === 'UPDATE' && vacancy.status === 'open' && payload.old_record?.status !== 'open') {
    return true
  }
  
  return false
}
