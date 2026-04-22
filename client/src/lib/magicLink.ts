/**
 * Magic-link (passwordless) sign-in.
 *
 * Works everywhere — including Meta / in-app WebViews where Google and
 * Apple OAuth are blocked by provider policy (disallowed_useragent). The
 * user enters their email, we send a one-time link via Supabase, they
 * tap it in their inbox, the link opens in the system browser, Supabase
 * exchanges the code, and AuthCallback.tsx finishes the login.
 *
 * For new signups the `role` arg is written into user_metadata so that
 * auth.ts's placeholder-profile insert knows which role to seed; for
 * existing-user sign-in, role is omitted and the user's existing profile
 * is loaded.
 */
import * as Sentry from '@sentry/react'
import { supabase } from './supabase'
import { getAuthRedirectUrl } from './siteUrl'
import { checkSignupRateLimit } from './rateLimit'
import { logger } from './logger'
import { reportAuthFlowError } from './sentryHelpers'

export type MagicLinkRole = 'player' | 'coach' | 'club' | 'brand' | 'umpire'

export interface SendMagicLinkOptions {
  email: string
  /** Role for new signups. Omit for existing-user sign-in. */
  role?: MagicLinkRole
}

export interface SendMagicLinkResult {
  ok: boolean
  /** Human-readable error message if ok=false. */
  error?: string
  /** True when the user was blocked by rate limiting (UI should show cooldown). */
  rateLimited?: boolean
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function sendMagicLink(options: SendMagicLinkOptions): Promise<SendMagicLinkResult> {
  const email = options.email.trim().toLowerCase()
  const role = options.role

  if (!email || !isValidEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' }
  }

  Sentry.addBreadcrumb({
    category: 'auth',
    type: 'user',
    level: 'info',
    message: 'magic_link.start',
    data: { emailDomain: email.split('@')[1] ?? null, hasRole: !!role },
  })

  // Reuse the signup rate-limit bucket: magic link and email+password
  // signup are equivalent from an abuse-rate perspective, and Landing
  // reuses the same helper for the existing-user path below — which is
  // conservative but safe (prevents credential-stuffing-style probes).
  const rateLimit = await checkSignupRateLimit(email)
  if (rateLimit && !rateLimit.allowed) {
    return { ok: false, rateLimited: true, error: 'Too many attempts. Please try again in a few minutes.' }
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getAuthRedirectUrl(),
        // data is written to user_metadata on FIRST sign-in only, which is
        // exactly what we want — role shouldn't overwrite on re-login.
        ...(role ? { data: { role } } : {}),
      },
    })

    if (error) {
      reportAuthFlowError('magic_link.send', error, {
        emailDomain: email.split('@')[1] ?? null,
        hasRole: !!role,
      })
      return { ok: false, error: 'Could not send the link. Please try again.' }
    }

    logger.debug('[magicLink] Link sent', { emailDomain: email.split('@')[1] })
    return { ok: true }
  } catch (err) {
    reportAuthFlowError('magic_link.send', err, {
      emailDomain: email.split('@')[1] ?? null,
      hasRole: !!role,
    })
    return { ok: false, error: 'Could not send the link. Please try again.' }
  }
}
