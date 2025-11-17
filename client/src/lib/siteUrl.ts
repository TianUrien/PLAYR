// Helpers for resolving the canonical site URL in every environment
type EnvRecord = Record<string, string | undefined>

const getEnvValue = (keys: string[], source?: EnvRecord): string | undefined => {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '')
const ensureLeadingSlash = (value: string): string => (value.startsWith('/') ? value : `/${value}`)

const processEnv =
  typeof process !== 'undefined' && process.env ? (process.env as EnvRecord) : undefined
const importMetaEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as EnvRecord)
    : undefined

const explicitSiteUrl = (() => {
  const processValue = getEnvValue(
    ['PUBLIC_SITE_URL', 'SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'APP_URL'],
    processEnv
  )
  const importMetaValue = getEnvValue(
    ['VITE_PUBLIC_SITE_URL', 'VITE_SITE_URL', 'PUBLIC_SITE_URL', 'SITE_URL'],
    importMetaEnv
  )
  const resolved = processValue ?? importMetaValue
  return resolved ? stripTrailingSlash(resolved) : undefined
})()

const fallbackSiteUrl = (): string => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'http://localhost:3000'
}

export const getSiteUrl = (): string => explicitSiteUrl ?? fallbackSiteUrl()

export const getAuthRedirectUrl = (): string => `${getSiteUrl()}${ensureLeadingSlash('auth/callback')}`
