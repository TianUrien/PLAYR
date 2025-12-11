// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  PublicOpportunityRow,
  PublicOpportunitiesResponse,
  PublicOpportunityDetailResponse,
  PublicAPIError,
  PublicOpportunitiesQuery,
  transformToPublicOpportunity,
  validateQueryParams,
  DEFAULT_LIMIT,
  RATE_LIMIT,
} from '../_shared/public-api-types.ts'

/**
 * ============================================================================
 * Public Opportunities API - Edge Function
 * ============================================================================
 * 
 * A public, read-only API for AI agents and external consumers to discover
 * field hockey opportunities on PLAYR.
 * 
 * Endpoints:
 *   GET /public-opportunities         - List all open opportunities
 *   GET /public-opportunities/{id}    - Get a single opportunity by ID
 * 
 * Query Parameters (for list endpoint):
 *   - position: goalkeeper | defender | midfielder | forward
 *   - gender: Men | Women
 *   - country: Country name (e.g., "Netherlands")
 *   - opportunity_type: player | coach
 *   - priority: high | medium | low
 *   - limit: 1-100 (default: 20)
 *   - offset: 0+ (default: 0)
 * 
 * Security:
 *   - No authentication required (public data only)
 *   - Rate limited: 60 req/min, 500 req/hour per IP
 *   - Response caching: 5 minutes
 *   - CORS: Open (*)
 * 
 * Data Boundary:
 *   - Only exposes data from the public_opportunities view
 *   - No internal IDs, contact info, or PII
 *   - Only open vacancies from non-test, onboarded clubs
 * 
 * ============================================================================
 */

// =============================================================================
// RATE LIMITING (Simple in-memory store)
// =============================================================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory rate limit store (resets on function cold start)
// For production, consider using Upstash Redis or similar
const rateLimitStore = new Map<string, RateLimitEntry>()

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute window
  const key = `rate:${ip}`
  
  const entry = rateLimitStore.get(key)
  
  if (!entry || now > entry.resetAt) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  
  if (entry.count >= RATE_LIMIT.REQUESTS_PER_MINUTE) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }
  
  entry.count++
  return { allowed: true }
}

// Clean up old entries periodically (every 100 requests)
let requestCount = 0
function cleanupRateLimitStore() {
  requestCount++
  if (requestCount % 100 === 0) {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key)
      }
    }
  }
}

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

function jsonResponse(data: any, status = 200, cacheSeconds = RATE_LIMIT.CACHE_TTL_SECONDS): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
    },
  })
}

function errorResponse(code: string, message: string, status: number, details?: string): Response {
  const error: PublicAPIError = {
    error: { code, message, ...(details && { details }) },
  }
  return new Response(JSON.stringify(error), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return errorResponse(
      'METHOD_NOT_ALLOWED',
      'Only GET requests are allowed',
      405
    )
  }

  // Get client IP for rate limiting
  const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('cf-connecting-ip') 
    || 'unknown'

  // Check rate limit
  cleanupRateLimitStore()
  const rateCheck = checkRateLimit(clientIP)
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
          retry_after: rateCheck.retryAfter,
        },
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfter),
        },
      }
    )
  }

  // Parse URL
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  
  // Extract opportunity ID if present
  // Path: /public-opportunities or /public-opportunities/{id}
  // After Supabase routing, we get just the path after function name
  const opportunityId = pathParts.length > 0 && pathParts[0] !== 'public-opportunities' 
    ? pathParts[0] 
    : pathParts.length > 1 
      ? pathParts[1] 
      : null

  // Initialize Supabase client (using service role for view access)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables')
    return errorResponse(
      'INTERNAL_ERROR',
      'Service configuration error',
      500
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // ==========================================================================
    // GET /public-opportunities/{id} - Single opportunity
    // ==========================================================================
    if (opportunityId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(opportunityId)) {
        return errorResponse(
          'INVALID_ID',
          'Invalid opportunity ID format',
          400
        )
      }

      const { data, error } = await supabase
        .from('public_opportunities')
        .select('*')
        .eq('id', opportunityId)
        .single()

      if (error || !data) {
        return errorResponse(
          'NOT_FOUND',
          'Opportunity not found',
          404
        )
      }

      const response: PublicOpportunityDetailResponse = {
        data: transformToPublicOpportunity(data as PublicOpportunityRow),
      }

      return jsonResponse(response)
    }

    // ==========================================================================
    // GET /public-opportunities - List opportunities
    // ==========================================================================
    
    // Validate query parameters
    const validation = validateQueryParams(url.searchParams)
    if (!validation.valid) {
      return errorResponse(
        'INVALID_PARAMETER',
        validation.error || 'Invalid query parameter',
        400
      )
    }

    const query: PublicOpportunitiesQuery = validation.query

    // Build query
    let dbQuery = supabase
      .from('public_opportunities')
      .select('*', { count: 'exact' })

    // Apply filters
    if (query.position) {
      dbQuery = dbQuery.eq('position', query.position)
    }
    if (query.gender) {
      dbQuery = dbQuery.eq('gender', query.gender)
    }
    if (query.country) {
      dbQuery = dbQuery.ilike('location_country', query.country)
    }
    if (query.opportunity_type) {
      dbQuery = dbQuery.eq('opportunity_type', query.opportunity_type)
    }
    if (query.priority) {
      dbQuery = dbQuery.eq('priority', query.priority)
    }

    // Apply pagination and ordering
    const limit = query.limit || DEFAULT_LIMIT
    const offset = query.offset || 0

    dbQuery = dbQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await dbQuery

    if (error) {
      console.error('Database error:', error)
      return errorResponse(
        'DATABASE_ERROR',
        'Failed to fetch opportunities',
        500
      )
    }

    const total = count || 0
    const opportunities = (data as PublicOpportunityRow[]).map(transformToPublicOpportunity)

    const response: PublicOpportunitiesResponse = {
      data: opportunities,
      meta: {
        total,
        limit,
        offset,
        has_more: offset + opportunities.length < total,
      },
    }

    return jsonResponse(response)

  } catch (err) {
    console.error('Unexpected error:', err)
    return errorResponse(
      'INTERNAL_ERROR',
      'An unexpected error occurred',
      500
    )
  }
})
