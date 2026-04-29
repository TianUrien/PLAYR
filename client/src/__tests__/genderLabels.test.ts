import { describe, expect, it } from 'vitest'
import {
  PREFER_NOT_TO_SAY,
  genderToDisplay,
  normalizeGenderInput,
} from '@/lib/genderLabels'

describe('genderToDisplay', () => {
  it('translates legacy stored values to user-facing labels', () => {
    expect(genderToDisplay('Men')).toBe('Male')
    expect(genderToDisplay('Women')).toBe('Female')
  })

  it('is case-insensitive on input', () => {
    expect(genderToDisplay('men')).toBe('Male')
    expect(genderToDisplay('WOMEN')).toBe('Female')
    expect(genderToDisplay('Male')).toBe('Male')
    expect(genderToDisplay('female')).toBe('Female')
  })

  it('returns empty string for null / undefined / empty', () => {
    expect(genderToDisplay(null)).toBe('')
    expect(genderToDisplay(undefined)).toBe('')
    expect(genderToDisplay('')).toBe('')
    expect(genderToDisplay('   ')).toBe('')
  })

  it('returns empty string for unrecognized values (no leak of raw data)', () => {
    expect(genderToDisplay('Other')).toBe('')
    expect(genderToDisplay('xyz')).toBe('')
  })
})

describe('normalizeGenderInput', () => {
  it('keeps the legacy stored canonical form for backward compat', () => {
    expect(normalizeGenderInput('Men')).toBe('Men')
    expect(normalizeGenderInput('Women')).toBe('Women')
  })

  it('accepts the new display labels and maps them to legacy values', () => {
    expect(normalizeGenderInput('Male')).toBe('Men')
    expect(normalizeGenderInput('male')).toBe('Men')
    expect(normalizeGenderInput('Female')).toBe('Women')
    expect(normalizeGenderInput('female')).toBe('Women')
  })

  it('maps the prefer-not-to-say sentinel to null', () => {
    expect(normalizeGenderInput(PREFER_NOT_TO_SAY)).toBeNull()
    expect(normalizeGenderInput('PREFER_NOT_TO_SAY')).toBeNull()
  })

  it('returns null for empty / null / undefined / whitespace', () => {
    expect(normalizeGenderInput(null)).toBeNull()
    expect(normalizeGenderInput(undefined)).toBeNull()
    expect(normalizeGenderInput('')).toBeNull()
    expect(normalizeGenderInput('   ')).toBeNull()
  })

  it('returns null for unrecognized values rather than persisting them', () => {
    expect(normalizeGenderInput('Other')).toBeNull()
    expect(normalizeGenderInput('foo')).toBeNull()
  })

  it('PREFER_NOT_TO_SAY constant is the documented sentinel', () => {
    expect(PREFER_NOT_TO_SAY).toBe('prefer_not_to_say')
  })
})
