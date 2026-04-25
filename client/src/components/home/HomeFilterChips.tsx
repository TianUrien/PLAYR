import { useMemo } from 'react'
import { useCountries } from '@/hooks/useCountries'
import type { FilterRole, HomeFilters } from './homeFilters'

/**
 * HomeFilterChips
 *
 * Persistent country + role filters above the Home feed. The strategic
 * decision (documented in the Home strategy plan) is that at HOCKIA's
 * current scale (~200 users) Home stays a global community feed by
 * default, with filters as the user's primary lever to slice it.
 *
 * Country filter: top hockey countries surfaced as chips. Brand-authored
 * items pass through any country filter at the RPC layer — brands are
 * universal — so users filtering to "Argentina only" still see brand
 * content. That's enforced server-side in get_home_feed; the UI just
 * shows the chips and reports the selection.
 *
 * Role filter: all 5 HOCKIA roles. Multi-select.
 *
 * Both filters are multi-select, with an "All" pill that clears the
 * selection (treated as "no filter"). Empty selection == "All".
 *
 * Types + EMPTY_FILTERS live in `./homeFilters.ts` to keep this file a
 * components-only module (Vite Fast Refresh requires that).
 */

// Top hockey countries surfaced first. ISO alpha-2 codes; resolved to
// country IDs via the useCountries hook. The order roughly tracks FIH
// ranking + HOCKIA's likely user concentration. Less-active countries
// can still be selected via the future "More countries" picker (Phase 0.4).
const FEATURED_COUNTRY_CODES = ['AR', 'NL', 'BE', 'DE', 'AU', 'ES', 'IN', 'GB']

const ROLE_OPTIONS: Array<{ value: FilterRole; label: string }> = [
  { value: 'player', label: 'Players' },
  { value: 'coach', label: 'Coaches' },
  { value: 'club', label: 'Clubs' },
  { value: 'brand', label: 'Brands' },
  { value: 'umpire', label: 'Umpires' },
]

interface HomeFilterChipsProps {
  filters: HomeFilters
  onChange: (next: HomeFilters) => void
}

export function HomeFilterChips({ filters, onChange }: HomeFilterChipsProps) {
  const { countries, loading: countriesLoading } = useCountries()

  // Resolve featured country codes to actual country records. Order by
  // FEATURED_COUNTRY_CODES (intentional curation, not alphabetical).
  const featuredCountries = useMemo(() => {
    if (countriesLoading || countries.length === 0) return []
    const byCode = new Map(countries.map(c => [c.code, c]))
    return FEATURED_COUNTRY_CODES
      .map(code => byCode.get(code))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
  }, [countries, countriesLoading])

  const isAllCountries = filters.countryIds.length === 0
  const isAllRoles = filters.roles.length === 0

  const toggleCountry = (id: number) => {
    const set = new Set(filters.countryIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ ...filters, countryIds: Array.from(set) })
  }

  const toggleRole = (role: FilterRole) => {
    const set = new Set(filters.roles)
    if (set.has(role)) set.delete(role)
    else set.add(role)
    onChange({ ...filters, roles: Array.from(set) as FilterRole[] })
  }

  const clearCountries = () => onChange({ ...filters, countryIds: [] })
  const clearRoles = () => onChange({ ...filters, roles: [] })

  return (
    <div className="space-y-2 mb-4">
      {/* Country row */}
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
        aria-label="Filter feed by country"
      >
        <FilterChip
          label="All countries"
          isActive={isAllCountries}
          onClick={clearCountries}
        />
        {featuredCountries.map(country => (
          <FilterChip
            key={country.id}
            label={
              <>
                {country.flag_emoji && (
                  <span className="mr-1.5" aria-hidden="true">
                    {country.flag_emoji}
                  </span>
                )}
                {country.common_name ?? country.name}
              </>
            }
            isActive={filters.countryIds.includes(country.id)}
            onClick={() => toggleCountry(country.id)}
          />
        ))}
      </div>

      {/* Role row */}
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
        aria-label="Filter feed by role"
      >
        <FilterChip
          label="All roles"
          isActive={isAllRoles}
          onClick={clearRoles}
        />
        {ROLE_OPTIONS.map(({ value, label }) => (
          <FilterChip
            key={value}
            label={label}
            isActive={filters.roles.includes(value)}
            onClick={() => toggleRole(value)}
          />
        ))}
      </div>
    </div>
  )
}

interface FilterChipProps {
  label: React.ReactNode
  isActive: boolean
  onClick: () => void
}

function FilterChip({ label, isActive, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive ? 'true' : 'false'}
      // min-h-[40px] + py-2 hits the WCAG 2.5.5 / Apple HIG ≥40-44px target
      // size on mobile. Previous py-1 + text-xs was ~26px, well under.
      className={`flex-shrink-0 inline-flex items-center min-h-[40px] px-3.5 py-2 rounded-full text-sm font-medium transition-colors border ${
        isActive
          ? 'bg-gradient-to-r from-[#8026FA] to-[#924CEC] text-white border-transparent shadow-sm'
          : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:text-gray-900'
      }`}
    >
      {label}
    </button>
  )
}
