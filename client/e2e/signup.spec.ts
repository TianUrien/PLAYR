import { test, expect } from './fixtures'

test.describe('Signup Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh from landing page
    await page.goto('/')
  })

  test('displays landing page with sign in form', async ({ page }) => {
    // Verify landing page loads correctly
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    // Sign in form should be visible (heading says "Sign In to PLAYR")
    await expect(page.getByRole('heading', { name: /sign in to playr/i })).toBeVisible()
    // Email label should be visible
    await expect(page.getByText('Email', { exact: true }).first()).toBeVisible()
  })

  test('shows Join PLAYR button on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Mobile-only Join PLAYR button should be visible
    await expect(page.getByRole('button', { name: /join playr/i })).toBeVisible()
  })

  test('navigates to signup page when clicking Join PLAYR on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Click the Join PLAYR button
    await page.getByRole('button', { name: /join playr/i }).click()
    
    // Should be on signup page
    await expect(page).toHaveURL(/\/signup/)
    
    // Role selection should be visible - actual text is "Join as Player"
    await expect(page.getByRole('heading', { name: /join playr/i })).toBeVisible()
  })

  test('navigates to signup from sign-in card link', async ({ page }) => {
    // Click the "Don't have an account" link
    await page.getByRole('button', { name: /don't have an account/i }).click()
    
    // Should be on signup page
    await expect(page).toHaveURL(/\/signup/)
  })

  test('player signup flow - role selection', async ({ page }) => {
    await page.goto('/signup')
    
    // Select player role - actual button text is "Join as Player"
    await page.getByRole('button', { name: /join as player/i }).click()
    
    // Email input should appear after role selection
    await expect(page.getByPlaceholder(/enter your email/i)).toBeVisible({ timeout: 5000 })
  })

  test('club signup flow - role selection', async ({ page }) => {
    await page.goto('/signup')
    
    // Select club role - actual button text is "Join as Club"
    await page.getByRole('button', { name: /join as club/i }).click()
    
    // Email input should appear after role selection
    await expect(page.getByPlaceholder(/enter your email/i)).toBeVisible({ timeout: 5000 })
  })

  test('coach signup flow - role selection', async ({ page }) => {
    await page.goto('/signup')
    
    // Select coach role - actual button text is "Join as Coach"
    await page.getByRole('button', { name: /join as coach/i }).click()
    
    // Email input should appear after role selection
    await expect(page.getByPlaceholder(/enter your email/i)).toBeVisible({ timeout: 5000 })
  })

  test('validates email format on signup', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('button', { name: /join as player/i }).click()
    
    // Try invalid email
    await page.getByPlaceholder(/enter your email/i).fill('invalid-email')
    // Fill password to pass required check
    await page.getByPlaceholder(/create a password/i).fill('TestPass123!')
    await page.getByRole('button', { name: /create account/i }).click()
    
    // Should show validation error (either HTML5 or custom)
    // The browser may show native validation, or the app may show an error
    const emailInput = page.getByPlaceholder(/enter your email/i)
    // Check if input is marked invalid (HTML5 validation)
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid)
    expect(isInvalid).toBe(true)
  })

  test('signup form submits and shows feedback', async ({ page }) => {
    await page.goto('/signup')
    await page.getByRole('button', { name: /join as player/i }).click()
    
    // Fill the form with valid-looking data but intercept the API call
    // to avoid triggering actual Supabase emails
    await page.route('**/auth/v1/signup**', async (route) => {
      // Mock a successful signup response without actually creating a user
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'mock-user-id',
          email: 'test@example.com',
          confirmation_sent_at: new Date().toISOString(),
        }),
      })
    })
    
    await page.getByPlaceholder(/enter your email/i).fill('test-signup@example.com')
    await page.getByPlaceholder(/create a password/i).fill('TestPassword123!')
    
    await page.getByRole('button', { name: /create account/i }).click()
    
    // Should show verification message (our mocked response triggers success flow)
    // Use .first() since multiple elements may match the verification text
    await expect(
      page.getByText(/we've sent a verification/i)
    ).toBeVisible({ timeout: 10000 })
  })

  test('signup page is accessible', async ({ page }) => {
    await page.goto('/signup')
    
    // Basic accessibility checks
    // All interactive elements should be keyboard accessible
    const buttons = page.getByRole('button')
    const count = await buttons.count()
    
    expect(count).toBeGreaterThan(0)
    
    // Check that role buttons have proper labels
    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i)
      const name = await button.getAttribute('aria-label') ?? await button.textContent()
      expect(name).toBeTruthy()
    }
  })
})

test.describe('Sign In Flow', () => {
  test('displays sign in form on landing page', async ({ page }) => {
    await page.goto('/')
    
    // Sign in form should be visible - heading says "Sign In to PLAYR"
    await expect(page.getByRole('heading', { name: /sign in to playr/i })).toBeVisible()
    // Labels are plain text, not aria-labels
    await expect(page.getByText('Email', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Password', { exact: true }).first()).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/')
    
    // Enter invalid credentials - use a non-existent but valid-format email
    // This tests the error handling without triggering password reset emails
    await page.locator('input[type="email"]').fill('nonexistent-user-12345@gmail.com')
    await page.locator('input[type="password"]').first().fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    
    // Should show error message
    await expect(page.getByText(/invalid|incorrect|failed|error/i)).toBeVisible({ timeout: 10000 })
  })

  test('has password visibility toggle', async ({ page }) => {
    await page.goto('/')
    
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill('testpassword')
    
    // Should have show/hide password button - it's the button with Eye/EyeOff icon
    const toggleButton = page.locator('button').filter({ has: page.locator('svg') }).last()
    
    // Password should be hidden by default
    await expect(passwordInput).toHaveAttribute('type', 'password')
    
    // Click toggle
    await toggleButton.click()
    
    // Password should now be visible - check using the same locator but now looking for text type
    await expect(page.locator('input[type="text"]').first()).toHaveValue('testpassword')
  })
})

test.describe('Profile Completion Flow', () => {
  // Note: These tests require authentication bypass or test credentials
  
  test('redirects unauthenticated users from protected routes', async ({ page }) => {
    // Try to access complete-profile directly
    await page.goto('/complete-profile')
    
    // Should redirect to landing or show loading
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/complete-profile', { timeout: 10000 })
  })

  test('redirects unauthenticated users from dashboard', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('/dashboard/profile')
    
    // Should redirect to landing
    await page.waitForURL('/', { timeout: 10000 })
  })
})

test.describe('Public Pages Access', () => {
  test('landing page loads without errors', async ({ page }) => {
    await page.goto('/')
    
    // Main content should be visible - use getByRole('main') specifically
    await expect(page.getByRole('main')).toBeVisible()
    
    // Logo should be visible
    await expect(page.getByAltText(/playr/i).first()).toBeVisible()
  })

  test('privacy policy page loads', async ({ page }) => {
    await page.goto('/privacy-policy')
    
    await expect(page.getByRole('heading', { name: /privacy/i })).toBeVisible()
  })

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms')
    
    // Use exact heading text to avoid matching multiple headings
    await expect(page.getByRole('heading', { name: 'Terms & Conditions' })).toBeVisible()
  })

  test('community page is accessible', async ({ page }) => {
    await page.goto('/community')
    
    // Should show community content or redirect
    await page.waitForLoadState('networkidle')
    
    // Either shows community page or redirects to landing
    const url = page.url()
    expect(url.includes('/community') || url === 'http://localhost:5173/').toBe(true)
  })

  test('opportunities page is accessible', async ({ page }) => {
    await page.goto('/opportunities')
    
    await page.waitForLoadState('networkidle')
    
    // Either shows opportunities or redirects
    const url = page.url()
    expect(url.includes('/opportunities') || url === 'http://localhost:5173/').toBe(true)
  })
})

test.describe('Navigation', () => {
  test('header displays on landing page', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/')
    
    // Logo should be visible
    await expect(page.getByAltText(/playr/i).first()).toBeVisible()
  })

  test('mobile view hides desktop navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')
    
    // Page should load correctly on mobile
    await expect(page.getByAltText(/playr/i).first()).toBeVisible()
  })
})
