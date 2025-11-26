import { test as setup, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from multiple sources
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

/**
 * Authentication Setup for E2E Tests
 * 
 * This script authenticates test users via Supabase API and saves their
 * session storage state to be reused across tests.
 * 
 * Test users are created in the database beforehand (see e2e/README.md)
 */

// Test user credentials - use environment variables or defaults
const TEST_PLAYER = {
  email: process.env.E2E_PLAYER_EMAIL || 'e2e-player@playr.test',
  password: process.env.E2E_PLAYER_PASSWORD || 'Test1234!',
  profile: {
    role: 'player',
    full_name: 'E2E Test Player',
    username: 'e2e-test-player',
    base_location: 'London, UK',
    nationality: 'United Kingdom',
    position: 'midfielder',
    secondary_position: 'forward',
    gender: 'Men',
    date_of_birth: '1995-05-15',
    bio: 'E2E test player account for automated testing',
    onboarding_completed: true,
  },
}

const TEST_CLUB = {
  email: process.env.E2E_CLUB_EMAIL || 'e2e-club@playr.test',
  password: process.env.E2E_CLUB_PASSWORD || 'Test1234!',
  profile: {
    role: 'club',
    full_name: 'E2E Test FC',
    username: 'e2e-test-fc',
    base_location: 'Manchester, UK',
    nationality: 'United Kingdom',
    club_bio: 'E2E test club account for automated testing',
    league_division: 'Division 1',
    contact_email: 'contact@e2e-test-fc.playr.test',
    year_founded: 2020,
    onboarding_completed: true,
  },
}

// Storage state file paths
export const PLAYER_STORAGE_STATE = path.join(__dirname, '.auth/player.json')
export const CLUB_STORAGE_STATE = path.join(__dirname, '.auth/club.json')

// Ensure auth directory exists
const authDir = path.join(__dirname, '.auth')
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true })
}

/**
 * Authenticate a user via Supabase API and inject session into browser
 */
async function authenticateUser(
  page: import('@playwright/test').Page,
  email: string,
  password: string,
  storagePath: string,
  profileData?: Record<string, unknown>
) {
  // Get Supabase credentials from environment
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY'
    )
  }

  // Create Supabase client for authentication
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // Authenticate via API
  console.log(`[Auth Setup] Authenticating ${email}...`)
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error(`[Auth Setup] Failed to authenticate ${email}:`, error.message)
    throw new Error(`Authentication failed for ${email}: ${error.message}`)
  }

  if (!data.session) {
    throw new Error(`No session returned for ${email}`)
  }

  console.log(`[Auth Setup] Successfully authenticated ${email}`)
  console.log(`[Auth Setup] User ID: ${data.user?.id}`)
  console.log(`[Auth Setup] Token expires at: ${data.session.expires_at}`)

  // If profile data is provided, ensure the profile is complete
  if (profileData && data.user) {
    console.log(`[Auth Setup] Ensuring profile is complete for ${email}...`)
    
    // Create authenticated client with the user's session
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    })

    // Check if profile exists
    const { data: existingProfile, error: fetchError } = await authSupabase
      .from('profiles')
      .select('id, onboarding_completed')
      .eq('id', data.user.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.warn(`[Auth Setup] Error fetching profile: ${fetchError.message}`)
    }

    // Upsert profile if it doesn't exist or isn't complete
    if (!existingProfile || !existingProfile.onboarding_completed) {
      const { error: upsertError } = await authSupabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          email: data.user.email,
          ...profileData,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })

      if (upsertError) {
        console.warn(`[Auth Setup] Error upserting profile: ${upsertError.message}`)
        // Continue anyway - the tests might still work
      } else {
        console.log(`[Auth Setup] Profile completed for ${email}`)
      }
    } else {
      console.log(`[Auth Setup] Profile already complete for ${email}`)
    }
  }

  // Navigate to the app to set up the browser context
  await page.goto('/')

  // Wait for the page to fully load
  await page.waitForLoadState('domcontentloaded')

  // Inject the session into localStorage in the exact format Supabase expects
  // The format must match what @supabase/supabase-js stores internally
  await page.evaluate(
    ({ session, storageKey }) => {
      // Store session in the exact format the Supabase client uses
      const sessionData = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }
      localStorage.setItem(storageKey, JSON.stringify(sessionData))
      console.log('[E2E] Session injected into localStorage')
    },
    { session: data.session, storageKey: 'playr-auth' }
  )

  // Navigate to a protected route to trigger auth initialization
  await page.goto('/dashboard/profile')
  
  // Wait for the app to recognize the authenticated state
  // The page should either show the profile or redirect to onboarding
  try {
    // Wait for signs of authentication - either dashboard content or not being on landing page
    await Promise.race([
      page.waitForSelector('header:has-text("Profile")', { timeout: 15000 }),
      page.waitForSelector('[data-testid="dashboard"]', { timeout: 15000 }),
      page.waitForSelector('nav:has-text("Messages")', { timeout: 15000 }),
      page.waitForSelector('button:has-text("Sign Out")', { timeout: 15000 }),
      page.waitForSelector('a[href*="/dashboard"]', { timeout: 15000 }),
    ])
    console.log('[Auth Setup] Authentication confirmed - found authenticated UI elements')
  } catch {
    // Check current URL - if not on landing, we might be authenticated
    const currentUrl = page.url()
    if (currentUrl.includes('/dashboard') || currentUrl.includes('/onboarding')) {
      console.log(`[Auth Setup] Appears authenticated - on ${currentUrl}`)
    } else {
      // Take a screenshot for debugging
      const screenshotPath = storagePath.replace('.json', '-debug.png')
      await page.screenshot({ path: screenshotPath })
      console.log(`[Auth Setup] Warning: Could not confirm authentication. Screenshot: ${screenshotPath}`)
      console.log(`[Auth Setup] Current URL: ${currentUrl}`)
    }
  }

  // Save the storage state
  await page.context().storageState({ path: storagePath })
  console.log(`[Auth Setup] Saved storage state to ${storagePath}`)
}

/**
 * Setup: Authenticate Player user
 */
setup('authenticate as player', async ({ page }) => {
  await authenticateUser(page, TEST_PLAYER.email, TEST_PLAYER.password, PLAYER_STORAGE_STATE, TEST_PLAYER.profile)
})

/**
 * Setup: Authenticate Club user  
 */
setup('authenticate as club', async ({ page }) => {
  await authenticateUser(page, TEST_CLUB.email, TEST_CLUB.password, CLUB_STORAGE_STATE, TEST_CLUB.profile)
})
