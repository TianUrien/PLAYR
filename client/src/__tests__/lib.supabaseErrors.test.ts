import { describe, it, expect } from 'vitest'
import { isUniqueViolationError } from '@/lib/supabaseErrors'

describe('isUniqueViolationError', () => {
  it('returns false for null', () => {
    expect(isUniqueViolationError(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isUniqueViolationError(undefined)).toBe(false)
  })

  it('returns true for PostgreSQL unique violation code 23505', () => {
    expect(isUniqueViolationError({ code: '23505' })).toBe(true)
  })

  it('returns true when message contains "duplicate key value"', () => {
    expect(isUniqueViolationError({
      message: 'duplicate key value violates unique constraint "profiles_pkey"',
    })).toBe(true)
  })

  it('returns true when details contains "already exists"', () => {
    expect(isUniqueViolationError({
      details: 'Key (email)=(test@test.com) already exists.',
    })).toBe(true)
  })

  it('is case-insensitive for message matching', () => {
    expect(isUniqueViolationError({
      message: 'DUPLICATE KEY VALUE violates constraint',
    })).toBe(true)
  })

  it('is case-insensitive for details matching', () => {
    expect(isUniqueViolationError({
      details: 'Key Already Exists in table',
    })).toBe(true)
  })

  it('returns false for not-found error PGRST116', () => {
    expect(isUniqueViolationError({ code: 'PGRST116' })).toBe(false)
  })

  it('returns false for generic error without unique violation markers', () => {
    expect(isUniqueViolationError({
      code: '42501',
      message: 'new row violates row-level security policy',
    })).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isUniqueViolationError({})).toBe(false)
  })
})
