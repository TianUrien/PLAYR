/**
 * Pure profile-shape helpers — no auth/supabase imports, safe to import from
 * tests without mocking. Anything that touches the auth store lives in
 * `profile.ts` instead.
 */

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

/**
 * Extract the first name from a free-form full_name field. Trims and splits on
 * whitespace so multi-word first names ("Maria del Carmen") still surface only
 * the first token. Returns null for null/empty/whitespace-only input so callers
 * can branch cleanly on "do we know who this is yet?".
 */
export function getFirstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null
  const trimmed = fullName.trim()
  if (!trimmed) return null
  return trimmed.split(/\s+/)[0]
}

export function derivePublicContactEmail(profile: ContactEmailCarrier): DerivedContactEmail {
  const contactEmail = profile.contact_email?.trim() || null
  const shouldShow = Boolean(profile.contact_email_public)

  if (!shouldShow) {
    return { shouldShow: false, displayEmail: null, source: null }
  }

  if (contactEmail) {
    return { shouldShow: true, displayEmail: contactEmail, source: 'contact' }
  }

  // Safety: never fall back to exposing the login/account email.
  // If a user wants to be reachable, they must explicitly set a contact email.
  return { shouldShow: true, displayEmail: null, source: null }
}
