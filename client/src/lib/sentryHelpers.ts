import * as Sentry from '@sentry/react'

export function reportSupabaseError(scope: string, error: any, extras?: Record<string, any>, tags?: Record<string, string>) {
  Sentry.captureException(error, {
    tags: {
      scope,
      isSupabase: true,
      ...tags
    },
    extra: {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      ...extras
    }
  })
}
