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
