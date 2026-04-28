/**
 * Deno tests for recovery-query detection.
 *
 * Tightness matters: false positives push the user into a deterministic
 * recovery response when an LLM call would have been better. Both the
 * positive and negative sets below are part of the contract.
 *
 * Run:  deno test supabase/functions/_shared/recovery.test.ts --no-check
 */

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { detectRecoveryQuery } from './recovery.ts'

// ── Should match (recovery follow-ups) ─────────────────────────────────

const POSITIVE = [
  'what should I do?',
  'what should I do',
  'what do I do?',
  'what do I do now?',
  'what can I do next?',
  'so what should I do?',
  'so what now?',
  'what now?',
  'now what?',
  'what next?',
  'what else?',
  'anything else?',
  'any other ideas?',
  'any other options?',
  'any suggestions?',
  'any other suggestions?',
  'ok',
  'ok?',
  'okay',
  'alright',
  'hmm',
  'hmmm',
  'and?',
  'and',
  'so?',
  'help',
  'help me',
  'help?',
  'what should I try?',
  'what can I search?',
]

for (const q of POSITIVE) {
  Deno.test(`detectRecoveryQuery: matches "${q}"`, () => {
    assertEquals(detectRecoveryQuery(q), true)
  })
}

// ── Should NOT match (substantive queries that need the LLM) ───────────

const NEGATIVE = [
  // Substantive entity queries
  'find players for my team',
  'find clubs in spain',
  'show me coaches in argentina',
  'what about argentina?',
  'what about U21?',
  'how about brazilian players?',

  // Self-reflection queries that should hit the LLM directly
  'what should I improve in my profile?',
  'how do I get more visibility?',
  'who should I connect with?',
  'what can I do to improve my chances?',

  // Hockey knowledge questions
  'what is a penalty corner?',
  'how does the drag flick work?',
  'what are the rules of hockey?',

  // Generic platform questions
  'what is hockia?',
  'how does this app work?',

  // Long-form follow-ups (substantive enough for the LLM)
  "I'd like to look at U21 defenders instead",
  "actually let's try Argentinian players",
  'what should I do — should I move clubs or wait',

  // Empty / whitespace
  '',
  '   ',

  // Far too long
  'I am wondering what I should do next given that the search did not return any results that match my preferences',
]

for (const q of NEGATIVE) {
  Deno.test(`detectRecoveryQuery: does NOT match "${q}"`, () => {
    assertEquals(detectRecoveryQuery(q), false)
  })
}

// ── Edge cases ─────────────────────────────────────────────────────────

Deno.test('detectRecoveryQuery: trims surrounding whitespace', () => {
  assertEquals(detectRecoveryQuery('   what should I do?   '), true)
})

Deno.test('detectRecoveryQuery: case-insensitive', () => {
  assertEquals(detectRecoveryQuery('WHAT SHOULD I DO?'), true)
  assertEquals(detectRecoveryQuery('What Now?'), true)
})

Deno.test('detectRecoveryQuery: rejects queries longer than 60 chars even if shape matches', () => {
  const long = 'what should I do '.repeat(5).trim() // ~85 chars
  assertEquals(long.length > 60, true)
  assertEquals(detectRecoveryQuery(long), false)
})
