/**
 * Vitest configuration for database integration tests.
 *
 * These tests run against a real Supabase instance (staging) and verify
 * RLS policies, state machine transitions, and trigger correctness.
 *
 * Required env vars (same as E2E tests):
 *   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
 *   E2E_PLAYER_EMAIL, E2E_PLAYER_PASSWORD,
 *   E2E_CLUB_EMAIL, E2E_CLUB_PASSWORD,
 *   E2E_COACH_EMAIL, E2E_COACH_PASSWORD,
 *   E2E_BRAND_EMAIL, E2E_BRAND_PASSWORD
 */
import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '.env.local') })
dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })

export default defineConfig({
  test: {
    include: ['src/__tests__/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
