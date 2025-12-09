import { useCountries, type Country } from '@/hooks/useCountries'

interface DualNationalityDisplayProps {
  /** Primary nationality country ID */
  primaryCountryId: number | null | undefined
  /** Secondary nationality country ID (optional) */
  secondaryCountryId?: number | null
  /** Primary passport country ID */
  passport1CountryId?: number | null
  /** Secondary passport country ID */
  passport2CountryId?: number | null
  /** Fallback text for primary nationality if no country ID */
  fallbackText?: string | null
  /** Display mode: 'full' for profile pages, 'compact' for cards */
  mode?: 'full' | 'compact'
  /** Additional CSS classes */
  className?: string
}

/**
 * Displays dual nationality with EU passport indication.
 * 
 * Full mode (profile headers/pages):
 * 🇦🇷 Argentine
 * 🇮🇹 Italian • EU Passport
 * 
 * Compact mode (cards):
 * 🇦🇷 🇮🇹 (with tooltip)
 */
export default function DualNationalityDisplay({
  primaryCountryId,
  secondaryCountryId,
  passport1CountryId,
  passport2CountryId,
  fallbackText,
  mode = 'full',
  className = '',
}: DualNationalityDisplayProps) {
  const { getCountryById, isEuCountry, loading } = useCountries()

  if (loading) {
    return <span className={className}>...</span>
  }

  const primaryCountry = getCountryById(primaryCountryId ?? null)
  const secondaryCountry = getCountryById(secondaryCountryId ?? null)

  // Check if any passport is EU
  const hasEu = isEuCountry(passport1CountryId ?? null) || isEuCountry(passport2CountryId ?? null)

  // Fallback to legacy text if no structured data
  if (!primaryCountry && !secondaryCountry) {
    if (fallbackText) {
      return <span className={className}>{fallbackText}</span>
    }
    return null
  }

  if (mode === 'compact') {
    return (
      <CompactDisplay
        primaryCountry={primaryCountry}
        secondaryCountry={secondaryCountry}
        hasEuPassport={hasEu}
        className={className}
      />
    )
  }

  return (
    <FullDisplay
      primaryCountry={primaryCountry}
      secondaryCountry={secondaryCountry}
      passport1CountryId={passport1CountryId}
      passport2CountryId={passport2CountryId}
      hasEuPassport={hasEu}
      isEuCountry={isEuCountry}
      className={className}
    />
  )
}

interface CompactDisplayProps {
  primaryCountry: Country | undefined
  secondaryCountry: Country | undefined
  hasEuPassport: boolean
  className: string
}

function CompactDisplay({ primaryCountry, secondaryCountry, hasEuPassport, className }: CompactDisplayProps) {
  const nationalities: { flag: string; name: string }[] = []

  if (primaryCountry) {
    nationalities.push({
      flag: primaryCountry.flag_emoji || '🏳️',
      name: primaryCountry.nationality_name,
    })
  }
  if (secondaryCountry) {
    nationalities.push({
      flag: secondaryCountry.flag_emoji || '🏳️',
      name: secondaryCountry.nationality_name,
    })
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {nationalities.map((nat, i) => (
        <span key={i} className="inline-flex items-center">
          <span className="text-base mr-1">{nat.flag}</span>
          <span>{nat.name}</span>
          {i < nationalities.length - 1 && <span className="mx-1">,</span>}
        </span>
      ))}
      {hasEuPassport && (
        <span className="ml-0.5 text-xs text-blue-600 font-medium">EU</span>
      )}
    </span>
  )
}

interface FullDisplayProps {
  primaryCountry: Country | undefined
  secondaryCountry: Country | undefined
  passport1CountryId?: number | null
  passport2CountryId?: number | null
  hasEuPassport: boolean
  isEuCountry: (id: number | null) => boolean
  className: string
}

function FullDisplay({
  primaryCountry,
  secondaryCountry,
  passport1CountryId,
  passport2CountryId,
  hasEuPassport,
  isEuCountry,
  className,
}: FullDisplayProps) {
  // Determine which nationalities/passports are EU
  const primaryIsEu = primaryCountry ? isEuCountry(primaryCountry.id) : false
  const secondaryIsEu = secondaryCountry ? isEuCountry(secondaryCountry.id) : false
  const passport1IsEu = isEuCountry(passport1CountryId ?? null)
  const passport2IsEu = isEuCountry(passport2CountryId ?? null)

  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {/* Primary nationality */}
      {primaryCountry && (
        <div className="flex items-center gap-1.5">
          <span>{primaryCountry.flag_emoji}</span>
          <span className="font-medium">{primaryCountry.nationality_name}</span>
          {primaryIsEu && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              EU
            </span>
          )}
        </div>
      )}

      {/* Secondary nationality */}
      {secondaryCountry && (
        <div className="flex items-center gap-1.5">
          <span>{secondaryCountry.flag_emoji}</span>
          <span className="font-medium">{secondaryCountry.nationality_name}</span>
          {secondaryIsEu && (
            <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
              EU
            </span>
          )}
        </div>
      )}

      {/* EU Passport eligibility badge - show if has EU passport but nationalities shown aren't EU */}
      {hasEuPassport && !primaryIsEu && !secondaryIsEu && (passport1IsEu || passport2IsEu) && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-xs text-blue-600 font-medium">
            ✓ Eligible to work in EU
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * Compact inline display for cards - shows flags only with tooltip
 */
export function NationalityFlagsInline({
  primaryCountryId,
  secondaryCountryId,
  passport1CountryId,
  passport2CountryId,
  fallbackText,
  className = '',
}: Omit<DualNationalityDisplayProps, 'mode'>) {
  return (
    <DualNationalityDisplay
      primaryCountryId={primaryCountryId}
      secondaryCountryId={secondaryCountryId}
      passport1CountryId={passport1CountryId}
      passport2CountryId={passport2CountryId}
      fallbackText={fallbackText}
      mode="compact"
      className={className}
    />
  )
}
