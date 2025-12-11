import { type ClassValue, clsx } from 'clsx'

/**
 * Utility function to merge class names
 * Combines clsx for conditional classes
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

/**
 * Parse a date-only string (YYYY-MM-DD) without timezone conversion.
 * 
 * JavaScript's `new Date("YYYY-MM-DD")` interprets the string as UTC midnight,
 * which causes the date to shift by -1 day when displayed in timezones behind UTC.
 * 
 * This function parses the date components and creates a local Date object,
 * ensuring the date displays exactly as stored.
 * 
 * @param dateString - A date string in YYYY-MM-DD format (e.g., "1993-02-26")
 * @returns A Date object set to midnight in the local timezone, or null if invalid
 */
export function parseDateOnly(dateString: string | null | undefined): Date | null {
  if (!dateString) return null
  
  // Handle ISO datetime strings (with time component) - use as-is
  if (dateString.includes('T')) {
    return new Date(dateString)
  }
  
  // Parse YYYY-MM-DD format without timezone conversion
  const [year, month, day] = dateString.split('-').map(Number)
  if (!year || !month || !day) return null
  
  // Create date using local timezone (month is 0-indexed)
  return new Date(year, month - 1, day)
}

/**
 * Format date to readable string.
 * Handles date-only strings (YYYY-MM-DD) correctly without timezone shift.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseDateOnly(date) ?? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/**
 * Format a date of birth string for display.
 * Ensures no timezone shift occurs for date-only values.
 * 
 * @param dateOfBirth - Date string in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "February 26, 1993") or null if invalid
 */
export function formatDateOfBirth(dateOfBirth: string | null | undefined): string | null {
  const date = parseDateOnly(dateOfBirth)
  if (!date) return null
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

/**
 * Calculate age from a date of birth string.
 * Handles date-only strings correctly without timezone shift.
 * 
 * @param dateOfBirth - Date string in YYYY-MM-DD format
 * @returns Age in years, or null if invalid
 */
export function calculateAge(dateOfBirth: string | null | undefined): number | null {
  const birthDate = parseDateOnly(dateOfBirth)
  if (!birthDate) return null
  
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }
  
  return age
}

/**
 * Debounce function for search inputs
 */
export function debounce<TArgs extends unknown[], TReturn>(
  func: (...args: TArgs) => TReturn,
  wait: number
): (...args: TArgs) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: TArgs) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Truncate text to specified length
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

/**
 * Generate random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}
