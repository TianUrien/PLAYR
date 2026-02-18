// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Lazy singleton Supabase service-role client.
 *
 * Edge functions run with `per_worker` policy — the Deno isolate persists
 * across requests within the same worker. Creating the client once at module
 * scope (lazily) avoids re-initializing the SDK on every invocation.
 *
 * Auth features are disabled because they are browser-only and add unnecessary
 * overhead in a server context.
 */
let _client: ReturnType<typeof createClient> | null = null

export function getServiceClient(): ReturnType<typeof createClient> {
  if (!_client) {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}
