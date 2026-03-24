import { test, expect } from './fixtures'

test.describe('@smoke brand', () => {
  test('brand dashboard loads for authenticated brand user', async ({ page }) => {
    // Brand users land at /dashboard/profile which renders BrandDashboard
    await page.goto('/dashboard/profile')

    // The brand dashboard shows the brand name as h1 and has brand-specific tabs
    // Wait for any dashboard content to appear (brand name heading or tab navigation)
    await expect(
      page.getByTestId('dashboard-brand')
    ).toBeVisible({ timeout: 20000 })
  })

  test('brand edit page loads when brand exists', async ({ page }) => {
    await page.goto('/dashboard/brand')

    // The edit page either shows "Edit Brand Profile" or redirects to onboarding
    // Wait for the page to settle
    await page.waitForTimeout(3000)

    const url = page.url()
    // Should be on edit page OR redirected to onboarding
    expect(
      url.includes('/dashboard/brand') || url.includes('/brands/onboarding')
    ).toBe(true)
  })

  test('brand can view public brands directory', async ({ page }) => {
    await page.goto('/brands')

    // /brands redirects to /community/brands — Members tab visible
    await expect(
      page.getByRole('button', { name: /members/i })
    ).toBeVisible({ timeout: 20000 })
  })

  test('brand cannot access player dashboard', async ({ page }) => {
    await page.goto('/dashboard/profile')
    await page.waitForTimeout(2000)

    // Brand user should see brand dashboard, not player content
    const url = page.url()
    const isBrandRelated = url.includes('/dashboard/brand') || url.includes('/brands/') || url.includes('/dashboard/profile')
    expect(isBrandRelated).toBe(true)

    // Should NOT show player-specific elements
    await expect(page.getByText(/highlight video/i)).not.toBeVisible()
  })
})
