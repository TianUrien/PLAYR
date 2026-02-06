import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from multiple sources
// Priority: .env.local > .env (in both client and root directories)
dotenv.config({ path: path.join(__dirname, '.env.local') })
dotenv.config({ path: path.join(__dirname, '.env') })
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '.env') })

// Storage state paths for authenticated sessions
const authDir = path.join(__dirname, 'e2e/.auth')
export const PLAYER_STORAGE_STATE = path.join(authDir, 'player.json')
export const CLUB_STORAGE_STATE = path.join(authDir, 'club.json')
export const COACH_STORAGE_STATE = path.join(authDir, 'coach.json')
export const BRAND_STORAGE_STATE = path.join(authDir, 'brand.json')

const includeWebkit = process.env.PLAYWRIGHT_WEBKIT === '1'

/**
 * Playwright configuration for PLAYR E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],
  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    /* Video on failure */
    video: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    // Setup project - authenticates test users
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Default project - no authentication (public pages)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /.*\.authenticated\.spec\.ts|.*\.player\.spec\.ts|.*\.club\.spec\.ts|.*\.coach\.spec\.ts|.*\.brand\.spec\.ts/,
    },

    // Authenticated as Player - for player-specific flows
    {
      name: 'chromium-player',
      use: {
        ...devices['Desktop Chrome'],
        storageState: PLAYER_STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.authenticated\.spec\.ts|.*\.player\.spec\.ts/,
    },

    // Authenticated as Club - for club-specific flows  
    {
      name: 'chromium-club',
      use: {
        ...devices['Desktop Chrome'],
        storageState: CLUB_STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.club\.spec\.ts/,
    },

    // Authenticated as Coach - for coach-specific flows  
    {
      name: 'chromium-coach',
      use: {
        ...devices['Desktop Chrome'],
        storageState: COACH_STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.coach\.spec\.ts/,
    },

    // Authenticated as Brand - for brand-specific flows
    {
      name: 'chromium-brand',
      use: {
        ...devices['Desktop Chrome'],
        storageState: BRAND_STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /.*\.brand\.spec\.ts/,
    },

    // Optional WebKit projects (iOS Safari proxy). Enable with PLAYWRIGHT_WEBKIT=1
    ...(includeWebkit
      ? [
          {
            name: 'webkit',
            use: { ...devices['iPhone 14'] },
            testIgnore: /.*\.authenticated\.spec\.ts|.*\.player\.spec\.ts|.*\.club\.spec\.ts/,
          },
          {
            name: 'webkit-player',
            use: {
              ...devices['iPhone 14'],
              storageState: PLAYER_STORAGE_STATE,
            },
            dependencies: ['setup'],
            testMatch: /.*\.authenticated\.spec\.ts|.*\.player\.spec\.ts/,
          },
        ]
      : []),
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
