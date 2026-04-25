import { useState, useEffect, useCallback } from 'react'

/**
 * Drop-in `useState` replacement that persists to localStorage. Unlike
 * `usePageState` (which is scoped per `location.key` and only restores
 * on POP navigation), this hook restores on every mount and survives
 * close/reopen — for state that should "feel sticky" across sessions
 * on the same device (e.g. Home filter selection).
 *
 * Per-device only. For cross-device persistence we'd need a server-side
 * user_preferences row; not worth the surface area at HOCKIA's current
 * scale.
 *
 * Optional `validate` predicate guards against shape drift across deploys:
 * if a user has stale localStorage from a prior schema, JSON.parse may
 * succeed but the parsed value's shape can be wrong, and downstream code
 * (e.g. `state.someArray.length`) would crash. When validate returns
 * false, the saved value is discarded and `initialState` is used instead.
 */
export function usePersistedState<T>(
  key: string,
  initialState: T,
  validate?: (parsed: unknown) => parsed is T
): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `hockia:persisted:${key}`

  const [state, setStateInternal] = useState<T>(() => {
    if (typeof window === 'undefined') return initialState
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved === null) return initialState
      const parsed = JSON.parse(saved) as unknown
      if (validate && !validate(parsed)) return initialState
      return parsed as T
    } catch {
      /* corrupted JSON or localStorage disabled — fall through */
      return initialState
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      /* quota exceeded or disabled — silently ignore, this is best-effort */
    }
  }, [state, storageKey])

  const setState = useCallback((value: T | ((prev: T) => T)) => {
    setStateInternal(value)
  }, [])

  return [state, setState]
}
