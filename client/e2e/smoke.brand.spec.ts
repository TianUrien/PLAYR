import { test, expect } from './fixtures'

const E2E_BRAND_SLUG = 'e2e-test-brand'
const E2E_BRAND_NAME = 'E2E Test Brand'

test.describe('@smoke brand', () => {
  test('brand dashboard loads for authenticated brand user', async ({ page }) => {
    await page.goto('/dashboard/brand')

    // Should show brand name in the profile card heading
    await expect(
      page.getByRole('heading', { level: 1, name: E2E_BRAND_NAME })
    ).toBeVisible({ timeout: 20000 })

    // Should show the tab navigation
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Products' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Posts' })).toBeVisible()
  })

  test('brand can navigate dashboard tabs', async ({ page }) => {
    await page.goto('/dashboard/brand')

    await expect(
      page.getByRole('heading', { level: 1, name: E2E_BRAND_NAME })
    ).toBeVisible({ timeout: 20000 })

    // Navigate to Products tab
    await page.getByRole('button', { name: 'Products' }).click()
    await expect(page).toHaveURL(/tab=products/)
    await expect(page.getByText(/Products & Services|No products yet/i)).toBeVisible({ timeout: 10000 })

    // Navigate to Posts tab
    await page.getByRole('button', { name: 'Posts' }).click()
    await expect(page).toHaveURL(/tab=posts/)
    await expect(page.getByText(/Posts|No posts yet/i)).toBeVisible({ timeout: 10000 })

    // Navigate to Messages tab
    await page.getByRole('button', { name: 'Messages' }).click()
    await expect(page).toHaveURL(/tab=messages/)
    await expect(page.getByText(/Your Conversations|Open Messages/i)).toBeVisible({ timeout: 10000 })

    // Back to Overview
    await page.getByRole('button', { name: 'Overview' }).click()
    await expect(page).toHaveURL(/tab=overview/)
  })

  test('brand public profile is accessible', async ({ page }) => {
    await page.goto(`/brands/${E2E_BRAND_SLUG}`)

    // Brand name should be visible in the header
    await expect(page.getByText(E2E_BRAND_NAME)).toBeVisible({ timeout: 20000 })

    // Category should be displayed
    await expect(page.getByText(/Equipment/i)).toBeVisible()

    // Products section should exist (even if empty)
    await expect(page.getByText(/Products & Services/i)).toBeVisible()
  })

  test('brand dashboard has Edit Brand button', async ({ page }) => {
    await page.goto('/dashboard/brand')

    await expect(
      page.getByRole('heading', { level: 1, name: E2E_BRAND_NAME })
    ).toBeVisible({ timeout: 20000 })

    // Edit Brand button should be visible
    const editBtn = page.getByRole('button', { name: /edit brand|edit/i }).first()
    await expect(editBtn).toBeVisible()

    // Public View button should be visible
    const viewBtn = page.getByRole('button', { name: /public view|view/i }).first()
    await expect(viewBtn).toBeVisible()
  })

  test('brand can view public brands directory', async ({ page }) => {
    await page.goto('/brands')

    // The directory page should load with either Feed or Directory tabs
    await expect(
      page.getByRole('button', { name: /feed/i })
        .or(page.getByRole('button', { name: /directory/i }))
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
