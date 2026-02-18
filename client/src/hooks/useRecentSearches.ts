import { useState, useCallback } from 'react'

const STORAGE_KEY = 'playr_recent_searches'
const MAX_RECENT = 5

function readFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((s): s is string => typeof s === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function writeToStorage(searches: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(searches))
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>(readFromStorage)

  const addSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (trimmed.length < 2) return

    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT)
      writeToStorage(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setRecentSearches([])
    writeToStorage([])
  }, [])

  return { recentSearches, addSearch, clearAll }
}
