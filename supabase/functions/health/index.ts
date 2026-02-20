import { getServiceClient } from '../_shared/supabase-client.ts'
import { captureException } from '../_shared/sentry.ts'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const started = Date.now()

  try {
    const supabase = getServiceClient()

    // Lightweight DB check: query current timestamp
    const { error: dbError } = await supabase
      .rpc('health_check')

    const dbOk = !dbError
    const latencyMs = Date.now() - started

    const status = dbOk ? 'healthy' : 'degraded'
    const httpStatus = dbOk ? 200 : 503

    return new Response(
      JSON.stringify({
        status,
        timestamp: new Date().toISOString(),
        latency_ms: latencyMs,
        checks: {
          database: dbOk ? 'ok' : `error: ${dbError?.message}`,
          edge_function: 'ok',
        },
      }),
      {
        status: httpStatus,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    captureException(err, { functionName: 'health' })
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        latency_ms: Date.now() - started,
        checks: {
          database: 'unreachable',
          edge_function: 'ok',
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
