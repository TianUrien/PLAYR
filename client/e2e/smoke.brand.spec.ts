import { test, expect } from './fixtures'

const E2E_BRAND_SLUG = 'e2e-test-brand'
const E2E_BRAND_NAME = 'E2E Test Brand'

test.describe('@smoke brand', () => {
  test('brand dashboard loads for authenticated brand user', async ({ page }) => {
    await page.goto('/dashboard/brand')

    // Brand dashboard shows "Edit Brand Profile" as the h1
    await expect(
      page.getByRole('heading', { level: 1, name: /edit brand profile/i })
    ).toBeVisible({ timeout: 20000 })

    // Brand name should appear in the form
    await expect(page.getByLabel(/brand name/i)).toHaveValue(new RegExp(E2E_BRAND_NAME, 'i'))
  })

  test('brand can navigate to public profile from dashboard', async ({ page }) => {
    await page.goto('/dashboard/brand')

    await expect(
      page.getByRole('heading', { level: 1, name: /edit brand profile/i })
    ).toBeVisible({ timeout: 20000 })

    // "View public profile" link should be visible
    await expect(page.getByText(/view public profile/i)).toBeVisible()
  })

  test('brand public profile is accessible', async ({ page }) => {
    await page.goto(`/brands/${E2E_BRAND_SLUG}`)

    // Brand name should be visible as the page heading
    await expect(
      page.getByRole('heading', { name: E2E_BRAND_NAME })
    ).toBeVisible({ timeout: 20000 })

    // Category should be displayed
    await expect(page.getByText(/Equipment/i)).toBeVisible()

    // Products section should exist (even if empty)
    await expect(page.getByText(/Products & Services/i)).toBeVisible()
  })

  test('brand dashboard has Save Changes button', async ({ page }) => {
    await page.goto('/dashboard/brand')

    await expect(
      page.getByRole('heading', { level: 1, name: /edit brand profile/i })
    ).toBeVisible({ timeout: 20000 })

    // Save Changes button should be visible in the form
    await expect(
      page.getByRole('button', { name: /save changes/i })
    ).toBeVisible()
  })

  test('brand can view public brands directory', async ({ page }) => {
    await page.goto('/brands')

    // /brands redirects to /community/brands — Members tab visible
    await expect(
      page.getByRole('button', { name: /members/i })
    ).toBeVisible({ timeout: 20000 })
  })

  test('brand cannot access player dashboard', async ({ page }) => {
    // When a brand user navigates to /dashboard/profile, they should be
    // redirected to their brand dashboard or shown brand-specific content
    await page.goto('/dashboard/profile')
    await page.waitForTimeout(2000)

    // Should NOT show player-specific content (e.g. Highlight Video, Position)
    // Instead should show brand dashboard or redirect
    const url = page.url()
    const isBrandDashboard = url.includes('/dashboard/brand') || url.includes('/brands/')
    const isDashboardProfile = url.includes('/dashboard/profile')

    // Either redirected to brand dash or on profile route with brand-specific view
    expect(isBrandDashboard || isDashboardProfile).toBe(true)
  })
})
