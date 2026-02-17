import { describe, it, expect } from 'vitest'
import { AuthApiError } from '@supabase/supabase-js'
import { isSessionExpiredError } from '@/lib/auth'

/**
 * AuthApiError is a real class from @supabase/supabase-js.
 * Constructor: new AuthApiError(message, status, statusText?)
 */
function makeAuthApiError(message: string, status: number): AuthApiError {
  return new AuthApiError(message, status, '')
}

describe('isSessionExpiredError', () => {
  it('returns false for null', () => {
    expect(isSessionExpiredError(null)).toBe(false)
  })

  it('returns false for a generic Error (not AuthApiError)', () => {
    const err = new Error('some error') as never
    expect(isSessionExpiredError(err)).toBe(false)
  })

  it('returns true for "invalid refresh token"', () => {
    const err = makeAuthApiError('Invalid Refresh Token: token expired', 400)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "refresh token expired"', () => {
    const err = makeAuthApiError('Refresh token expired', 400)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "refresh token not found"', () => {
    const err = makeAuthApiError('Refresh Token Not Found', 400)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "session expired"', () => {
    const err = makeAuthApiError('Session expired', 401)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "session not found"', () => {
    const err = makeAuthApiError('Session not found', 400)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "invalid claim"', () => {
    const err = makeAuthApiError('Invalid claim: missing sub claim', 401)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for "token is expired"', () => {
    const err = makeAuthApiError('Token is expired or invalid', 401)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for status 401 regardless of message', () => {
    const err = makeAuthApiError('Something else entirely', 401)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns true for status 403 regardless of message', () => {
    const err = makeAuthApiError('Forbidden', 403)
    expect(isSessionExpiredError(err)).toBe(true)
  })

  it('returns false for "email not confirmed" (not a session expiry)', () => {
    const err = makeAuthApiError('Email not confirmed', 400)
    expect(isSessionExpiredError(err)).toBe(false)
  })

  it('returns false for "invalid login credentials" (not a session expiry)', () => {
    const err = makeAuthApiError('Invalid login credentials', 400)
    expect(isSessionExpiredError(err)).toBe(false)
  })

  it('returns false for rate limit error', () => {
    const err = makeAuthApiError('For security purposes, you can only request this once every 60 seconds', 429)
    expect(isSessionExpiredError(err)).toBe(false)
  })

  it('is case-insensitive for message matching', () => {
    const err = makeAuthApiError('INVALID REFRESH TOKEN', 400)
    expect(isSessionExpiredError(err)).toBe(true)
  })
})
