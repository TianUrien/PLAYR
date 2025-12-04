# E2E Testing Setup

This directory contains end-to-end tests for PLAYR using Playwright.

## ⚠️ IMPORTANT: Real Gmail Test Accounts Required

**E2E tests use dedicated Gmail test accounts to avoid Supabase email bounces.**

The following accounts are pre-configured for E2E testing:

| Role | Email | Password |
|------|-------|----------|
| Player | `playrplayer93@gmail.com` | `Hola1234` |
| Club | `clubplayr8@gmail.com` | `Hola1234` |
| Coach | `coachplayr@gmail.com` | `Hola1234` |

These accounts already exist in production Supabase with completed profiles.

### Environment Setup

Add these to your `.env` or `.env.local`:

```bash
E2E_PLAYER_EMAIL=playrplayer93@gmail.com
E2E_PLAYER_PASSWORD=Hola1234
E2E_CLUB_EMAIL=clubplayr8@gmail.com
E2E_CLUB_PASSWORD=Hola1234
E2E_COACH_EMAIL=coachplayr@gmail.com
E2E_COACH_PASSWORD=Hola1234
```

---

## Current Test Status ✅

| Category | Tests | Status |
|----------|-------|--------|
| Signup Flow | 12 | ✅ Passing |
| Sign In Flow | 3 | ✅ Passing |
| Public Pages | 5 | ✅ Passing |
| Navigation | 3 | ✅ Passing |
| Opportunities (Auth) | 14 | ✅ Passing |
| Messages (Auth) | 7 | ✅ Passing |
| Auth Setup | 2 | ✅ Passing |
| **Total** | **49** | **✅ All Passing** |

## Test Structure

```
e2e/
├── .auth/                    # Authentication storage states (gitignored)
│   ├── player.json          # Pre-authenticated player session
│   └── club.json            # Pre-authenticated club session
├── auth.setup.ts            # Authentication setup script
├── fixtures.ts              # Test fixtures and page objects
├── signup.spec.ts           # Public signup flow tests
├── messaging.spec.ts        # Basic messaging tests (skipped, need auth)
├── vacancies.spec.ts        # Basic vacancy tests
├── opportunities.authenticated.spec.ts  # Authenticated opportunities tests
└── messages.authenticated.spec.ts       # Authenticated messages tests
```

## Test Projects

The Playwright config defines multiple test projects:

| Project | Authentication | File Pattern |
|---------|---------------|--------------|
| `chromium` | None | `*.spec.ts` (excludes authenticated) |
| `chromium-player` | Player session | `*.authenticated.spec.ts`, `*.player.spec.ts` |
| `chromium-club` | Club session | `*.club.spec.ts` |

## Setting Up Test Users

The auth setup script (`auth.setup.ts`) automatically:
1. Authenticates test users via Supabase API
2. Creates/completes their profiles if not already done
3. Saves the session state for use in authenticated tests

### Required Environment Variables

These are already configured in `.env` with the real Gmail test accounts:

```bash
E2E_PLAYER_EMAIL=playrplayer93@gmail.com
E2E_PLAYER_PASSWORD=Hola1234
E2E_CLUB_EMAIL=clubplayr8@gmail.com
E2E_CLUB_PASSWORD=Hola1234
E2E_COACH_EMAIL=coachplayr@gmail.com
E2E_COACH_PASSWORD=Hola1234
```

If these are not set, E2E tests will fail with a clear error message.

## Running Tests

### All Tests (Public Only)
```bash
npm run test:e2e
```

### With Authentication Setup
```bash
# This runs the setup project first, then authenticated tests
npx playwright test --project=chromium-player
```

### Run All Projects
```bash
npx playwright test
```

### Specific Test File
```bash
npx playwright test e2e/signup.spec.ts
```

### Debug Mode
```bash
npm run test:e2e:debug
```

### UI Mode
```bash
npm run test:e2e:ui
```

## Writing Tests

### Public Tests (No Auth)
Name your file `*.spec.ts`:

```typescript
import { test, expect } from './fixtures'

test('my public test', async ({ page }) => {
  await page.goto('/')
  // ...
})
```

### Authenticated Tests (Player)
Name your file `*.authenticated.spec.ts` or `*.player.spec.ts`:

```typescript
import { test, expect } from './fixtures'

test('my authenticated test', async ({ page }) => {
  // Session is already authenticated via storageState
  await page.goto('/opportunities')
  // ...
})
```

### Club-Specific Tests
Name your file `*.club.spec.ts`:

```typescript
import { test, expect } from './fixtures'

test('club can create vacancy', async ({ page }) => {
  await page.goto('/dashboard/profile')
  // ...
})
```

## Page Objects

Use the provided page objects for cleaner tests:

```typescript
import { test, expect } from './fixtures'

test('using page objects', async ({ opportunitiesPage, page }) => {
  await opportunitiesPage.openOpportunitiesPage()
  await opportunitiesPage.filterByLocation('Spain')
  await opportunitiesPage.waitForLoadingToComplete()
})
```

## Troubleshooting

### "Authentication failed"
- Ensure test users exist in your Supabase database
- Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
- Verify the email is confirmed for the test users

### Tests redirect to landing page
- The session might have expired
- Delete `e2e/.auth/` and re-run to regenerate sessions
- Check that the test file uses the correct naming pattern

### Flaky tests
- Increase timeouts in page object methods
- Use `waitForLoadState('networkidle')` after navigation
- Check for loading spinners before assertions

## CI/CD Integration

For CI, ensure environment variables are set in your CI config:

```yaml
# Example GitHub Actions
env:
  VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
  E2E_PLAYER_EMAIL: ${{ secrets.E2E_PLAYER_EMAIL }}
  E2E_PLAYER_PASSWORD: ${{ secrets.E2E_PLAYER_PASSWORD }}
```
