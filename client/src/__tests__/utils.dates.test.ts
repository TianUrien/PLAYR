import { describe, it, expect } from 'vitest'
import { calculateAge, formatDateOfBirth, parseDateOnly } from '@/lib/utils'

describe('date utils', () => {
  it('parseDateOnly returns a local date for YYYY-MM-DD', () => {
    const d = parseDateOnly('1993-02-26')
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(1993)
    expect(d?.getMonth()).toBe(1) // Feb (0-indexed)
    expect(d?.getDate()).toBe(26)
  })

  it('parseDateOnly rejects invalid dates (no rollover)', () => {
    expect(parseDateOnly('2025-02-31')).toBeNull()
    expect(parseDateOnly('2025-13-01')).toBeNull()
    expect(parseDateOnly('not-a-date')).toBeNull()
  })

  it('formatDateOfBirth returns null for invalid input', () => {
    expect(formatDateOfBirth('2025-02-31')).toBeNull()
  })

  it('calculateAge returns null for future DOB', () => {
    const nextYear = new Date().getFullYear() + 1
    expect(calculateAge(`${nextYear}-01-01`)).toBeNull()
  })

  it('calculateAge returns a non-negative integer for valid past DOB', () => {
    const age = calculateAge('2000-01-01')
    expect(age).not.toBeNull()
    expect(Number.isInteger(age)).toBe(true)
    expect((age ?? -1) >= 0).toBe(true)
  })
})
