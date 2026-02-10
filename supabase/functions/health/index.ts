import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const started = Date.now()

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
