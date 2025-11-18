import { logger } from '@/lib/logger'

const PROFILE_DRAFT_PREFIX = 'profileDraft'

type StoredProfileDraft<T> = {
  data: T
  updatedAt: string
  role: string
  userId: string
}

const hasWindow = () => typeof window !== 'undefined'

const buildKey = (userId: string, role: string) => `${PROFILE_DRAFT_PREFIX}:${role}:${userId}`

export function loadProfileDraft<T>(userId: string, role: string): T | null {
  if (!hasWindow()) return null
  const key = buildKey(userId, role)
  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<StoredProfileDraft<T>> | T
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      return (parsed.data ?? null) as T | null
    }
    return parsed as T
  } catch (error) {
    logger.warn?.('Failed to parse profile draft. Clearing stored value.', error)
    window.localStorage.removeItem(key)
    return null
  }
}

export function saveProfileDraft<T>(userId: string, role: string, data: T) {
  if (!hasWindow()) return
  const key = buildKey(userId, role)
  try {
    const payload: StoredProfileDraft<T> = {
      data,
      updatedAt: new Date().toISOString(),
      role,
      userId,
    }
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch (error) {
    logger.warn?.('Failed to persist profile draft', error)
  }
}

export function clearProfileDraft(userId: string, role: string) {
  if (!hasWindow()) return
  window.localStorage.removeItem(buildKey(userId, role))
}

export function clearAllProfileDraftsForUser(userId: string) {
  if (!hasWindow()) return
  const prefix = `${PROFILE_DRAFT_PREFIX}:`
  const suffix = `:${userId}`
  const keysToRemove: string[] = []

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key) continue
    if (key.startsWith(prefix) && key.endsWith(suffix)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key))
}
