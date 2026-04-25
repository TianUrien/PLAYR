/**
 * Shared filter types + defaults for the Home feed filters.
 * Kept in a non-component module to satisfy `react-refresh/only-export-components`.
 */

export type FilterRole = 'player' | 'coach' | 'club' | 'brand' | 'umpire'

export interface HomeFilters {
  countryIds: number[]
  roles: FilterRole[]
}

export const EMPTY_FILTERS: HomeFilters = { countryIds: [], roles: [] }

const VALID_ROLES: ReadonlyArray<FilterRole> = ['player', 'coach', 'club', 'brand', 'umpire']

/**
 * Type guard for persisted HomeFilters. Defends against shape drift across
 * deploys (a user with stale localStorage from before this shape existed
 * would otherwise crash the feed render with `.countryIds.length`).
 */
export function isHomeFilters(value: unknown): value is HomeFilters {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.countryIds) || !Array.isArray(v.roles)) return false
  if (!v.countryIds.every((id) => typeof id === 'number' && Number.isFinite(id))) return false
  if (!v.roles.every((r) => typeof r === 'string' && VALID_ROLES.includes(r as FilterRole))) return false
  return true
}
