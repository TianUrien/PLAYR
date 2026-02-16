import * as Sentry from '@sentry/react'
import { detectInAppBrowser } from './inAppBrowser'

type SupabaseErrorLike = {
  message?: string
  code?: string | number
  details?: string
  hint?: string
}

type ExtraMetadata = Record<string, unknown>
type TagMetadata = Record<string, string>

/**
 * Wraps a Supabase error (plain object with code/message/details/hint) in a
 * proper Error instance so Sentry displays the message instead of the
 * minified class name ("Ri", "Q", etc.).
 */
export function toSentryError(error: unknown): Error {
  if (error instanceof Error) return error

  const obj = (typeof error === 'object' && error !== null ? error : null) as SupabaseErrorLike | null
  const message = obj?.message || 'Unknown Supabase error'
  const wrapped = new Error(message)
  wrapped.name = 'SupabaseError'
  // Preserve original properties for Sentry extra context
  ;(wrapped as unknown as Record<string, unknown>).__raw = error
  return wrapped
}

/**
 * Gets in-app browser context for Sentry reporting
 */
function getInAppBrowserContext(): Record<string, string | boolean> {
  const browserInfo = detectInAppBrowser()
  return {
    isInAppBrowser: browserInfo.isInAppBrowser,
    inAppBrowserName: browserInfo.browserName ?? 'none',
  }
}

/**
 * Sets up global Sentry context with in-app browser information
 * Call this once during app initialization
 */
export function initSentryInAppBrowserContext(): void {
  const browserInfo = detectInAppBrowser()
  
  if (browserInfo.isInAppBrowser) {
    Sentry.setTag('in_app_browser', browserInfo.browserName ?? 'unknown')
    Sentry.setContext('browser_environment', {
      isInAppBrowser: true,
      browserName: browserInfo.browserName,
      canOpenInExternalBrowser: browserInfo.canOpenInExternalBrowser,
      suggestedAction: browserInfo.suggestedAction,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    })
  } else {
    Sentry.setTag('in_app_browser', 'none')
  }
}

export function reportSupabaseError(
  scope: string,
  error: unknown,
  extras: ExtraMetadata = {},
  tags: TagMetadata = {}
) {
  const supabaseError = (typeof error === 'object' && error !== null ? error : undefined) as SupabaseErrorLike | undefined
  const browserContext = getInAppBrowserContext()

  Sentry.captureException(toSentryError(error), {
    tags: {
      scope,
      isSupabase: true,
      ...browserContext,
      ...tags,
    },
    extra: {
      supabaseCode: supabaseError?.code,
      supabaseDetails: supabaseError?.details,
      supabaseHint: supabaseError?.hint,
      ...extras,
    },
  })
}

/**
 * Reports an auth flow error with in-app browser context
 * Use this for auth-specific errors where in-app browser detection is especially relevant
 */
export function reportAuthFlowError(
  stage: string,
  error: unknown,
  extras: ExtraMetadata = {}
) {
  const browserContext = getInAppBrowserContext()

  Sentry.captureException(toSentryError(error), {
    tags: {
      feature: 'auth_flow',
      stage,
      ...browserContext,
    },
    extra: {
      ...extras,
      browserEnvironment: browserContext,
    },
  })
}
