import { useAuthStore } from './auth'
import { logger } from './logger'

type ContactEmailSource = 'contact' | 'account' | null

interface ContactEmailCarrier {
  email?: string | null
  contact_email?: string | null
  contact_email_public?: boolean | null
}

interface DerivedContactEmail {
  shouldShow: boolean
  displayEmail: string | null
  source: ContactEmailSource
}

interface InvalidateProfileOptions {
  userId?: string
  reason?: string
}

/**
 * Central helper to bust the profile cache and refetch the latest copy.
 * Falls back to the currently authenticated user when no id is provided.
 */
export async function invalidateProfile({ userId, reason }: InvalidateProfileOptions = {}) {
  const { user, fetchProfile } = useAuthStore.getState()
  const targetUserId = userId ?? user?.id

  if (!targetUserId) {
    logger.warn('[PROFILE] Tried to invalidate profile without user id', { reason })
    return
  }

  if (reason) {
    logger.debug('[PROFILE] Invalidating profile cache', { userId: targetUserId, reason })
  }

  await fetchProfile(targetUserId, { force: true })
}

export function derivePublicContactEmail(profile: ContactEmailCarrier): DerivedContactEmail {
  const accountEmail = profile.email?.trim() || null
  const contactEmail = profile.contact_email?.trim() || null
  const shouldShow = Boolean(profile.contact_email_public)

  if (!shouldShow) {
    return { shouldShow: false, displayEmail: null, source: null }
  }

  if (contactEmail) {
    return { shouldShow: true, displayEmail: contactEmail, source: 'contact' }
  }

  return { shouldShow: Boolean(accountEmail), displayEmail: accountEmail, source: accountEmail ? 'account' : null }
}
