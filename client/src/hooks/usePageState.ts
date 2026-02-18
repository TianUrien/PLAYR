import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Drop-in `useState` replacement that persists to sessionStorage, keyed by `location.key`.
 * On POP navigation (back/forward), restores the saved value instead of using `initialState`.
 *
 * @param key   - Unique identifier for this piece of state (e.g. 'community-filters')
 * @param initialState - Default value used on fresh (PUSH) navigation
 */
export function usePageState<T>(key: string, initialState: T): [T, (value: T | ((prev: T) => T)) => void] {
  const location = useLocation()
  const navigationType = useNavigationType()
  const storageKey = `pageState:${location.key}:${key}`

  const [state, setStateInternal] = useState<T>(() => {
    if (navigationType === 'POP') {
      try {
        const saved = sessionStorage.getItem(storageKey)
        if (saved !== null) return JSON.parse(saved)
      } catch { /* fall through */ }
    }
    return initialState
  })

  // Persist to sessionStorage on every state change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch { /* sessionStorage full — ignore */ }
  }, [state, storageKey])

  // Wrap setState to support functional updates
  const setState = useCallback((value: T | ((prev: T) => T)) => {
    setStateInternal(value)
  }, [])

  return [state, setState]
}
