// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
  'https://www.oplayr.com',
  'https://oplayr.com',
  'https://playr-client.vercel.app',
  // Development origins
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
]

/**
 * Get CORS headers with origin validation.
 * Returns the request origin if allowed, otherwise defaults to primary production domain.
 */
export function getCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary': 'Origin',
  }
}

/**
 * @deprecated Use getCorsHeaders(req.headers.get('origin')) instead for proper origin validation.
 * This is kept for backward compatibility but allows all origins.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
