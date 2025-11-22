import * as Sentry from '@sentry/react'

type SupabaseErrorLike = {
  message?: string
  code?: string | number
  details?: string
  hint?: string
}

type ExtraMetadata = Record<string, unknown>
type TagMetadata = Record<string, string>

export function reportSupabaseError(
  scope: string,
  error: unknown,
  extras: ExtraMetadata = {},
  tags: TagMetadata = {}
) {
  const supabaseError = (typeof error === 'object' && error !== null ? error : undefined) as SupabaseErrorLike | undefined
  const fallbackMessage = error instanceof Error ? error.message : undefined

  Sentry.captureException(error, {
    tags: {
      scope,
      isSupabase: true,
      ...tags,
    },
    extra: {
      message: supabaseError?.message ?? fallbackMessage,
      code: supabaseError?.code,
      details: supabaseError?.details,
      hint: supabaseError?.hint,
      ...extras,
    },
  })
}
