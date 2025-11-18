import { logger } from './logger'

const MESSAGE_DRAFT_PREFIX = 'chatDraft'
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 14 // 14 days

type StoredMessageDraft = {
  content: string
  updatedAt: number
  expiresAt: number
}

const buildKey = (userId: string, conversationKey: string) =>
  `${MESSAGE_DRAFT_PREFIX}:${userId}:${conversationKey}`

export function loadMessageDraft(userId: string | null, conversationKey: string | null): string {
  if (typeof window === 'undefined' || !userId || !conversationKey) {
    return ''
  }

  const key = buildKey(userId, conversationKey)
  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return ''
  }

  try {
    const parsed = JSON.parse(raw) as StoredMessageDraft
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      window.localStorage.removeItem(key)
      return ''
    }
    return parsed.content ?? ''
  } catch (error) {
    logger.warn?.('Failed to parse message draft, clearing entry', error)
    window.localStorage.removeItem(key)
    return ''
  }
}

export function saveMessageDraft(userId: string | null, conversationKey: string | null, content: string) {
  if (typeof window === 'undefined' || !userId || !conversationKey) {
    return
  }

  const key = buildKey(userId, conversationKey)

  if (!content.trim()) {
    window.localStorage.removeItem(key)
    return
  }

  const payload: StoredMessageDraft = {
    content,
    updatedAt: Date.now(),
    expiresAt: Date.now() + DEFAULT_TTL_MS
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(payload))
  } catch (error) {
    logger.warn?.('Failed to persist message draft', error)
  }
}

export function clearMessageDraft(userId: string | null, conversationKey: string | null) {
  if (typeof window === 'undefined' || !userId || !conversationKey) {
    return
  }

  const key = buildKey(userId, conversationKey)
  window.localStorage.removeItem(key)
}
