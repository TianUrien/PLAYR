/**
 * Fire-and-forget database event tracking.
 *
 * Calls the existing `track_event()` RPC which handles auth.uid(),
 * role denormalization, and insertion into the `events` table.
 *
 * Never blocks UI, never throws — tracking failures are silently ignored.
 */

import { supabase } from '@/lib/supabase'

export function trackDbEvent(
  eventName: string,
  entityType?: string,
  entityId?: string,
  properties?: Record<string, unknown>,
): void {
  supabase
    .rpc('track_event', {
      p_event_name: eventName,
      p_entity_type: entityType ?? null,
      p_entity_id: entityId ?? null,
      p_properties: properties ?? {},
    })
    .then(() => {})
    .catch(() => {})
}
