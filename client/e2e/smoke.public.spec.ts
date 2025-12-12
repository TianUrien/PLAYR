import { test, expect } from './fixtures'

test.describe('@smoke public', () => {
  test('landing loads and shows Join CTA', async ({ page }) => {
    await page.goto('/')

    // Landing CTA is implemented as a button (not a link) and varies by breakpoint.
    const joinCta = page
      .getByRole('button', { name: /join playr/i })
      .or(page.getByRole('button', { name: /join now/i }))
      .first()
    await expect(joinCta).toBeVisible({ timeout: 20000 })
  })

  test('signup page loads and shows role selection', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByRole('button', { name: /join as player/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /join as coach/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /join as club/i })).toBeVisible({ timeout: 20000 })
  })

  test('opportunities page loads (public/indexable)', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 20000 })
  })
})
