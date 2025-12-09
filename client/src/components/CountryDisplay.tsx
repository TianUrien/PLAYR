import { useCountries } from '@/hooks/useCountries'

interface CountryDisplayProps {
  /** The country ID from nationality_country_id, passport1_country_id, etc. */
  countryId: number | null | undefined
  /** Fallback text to show if countryId is null but we have legacy text */
  fallbackText?: string | null
  /** If true, shows nationality name (e.g., "Argentine") instead of country name */
  showNationality?: boolean
  /** Additional CSS classes */
  className?: string
  /** If true, shows flag only without text */
  flagOnly?: boolean
}

/**
 * Displays a country with its flag emoji.
 * Prioritizes the structured country_id over legacy text fields.
 * 
 * Usage:
 * <CountryDisplay countryId={profile.nationality_country_id} fallbackText={profile.nationality} showNationality />
 */
export default function CountryDisplay({
  countryId,
  fallbackText,
  showNationality = false,
  className = '',
  flagOnly = false,
}: CountryDisplayProps) {
  const { getCountryById, loading } = useCountries()

  // If we have a country ID, use the structured data
  if (countryId) {
    const country = getCountryById(countryId)
    
    if (loading) {
      return <span className={className}>...</span>
    }

    if (country) {
      const displayText = showNationality ? country.nationality_name : country.name
      
      if (flagOnly) {
        return (
          <span className={className} title={displayText}>
            {country.flag_emoji || '🏳️'}
          </span>
        )
      }

      return (
        <span className={className}>
          {country.flag_emoji && <span className="mr-1.5">{country.flag_emoji}</span>}
          {displayText}
        </span>
      )
    }
  }

  // Fallback to legacy text if no country ID
  if (fallbackText) {
    return <span className={className}>{fallbackText}</span>
  }

  // Nothing to display
  return null
}
