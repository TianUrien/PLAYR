import { test, expect } from './fixtures'

test.describe('@smoke public', () => {
  test('landing loads and shows Join CTA', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /join playr/i })).toBeVisible({ timeout: 20000 })
  })

  test('signup page loads and shows role selection', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByRole('button', { name: /i'm a player/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /i'm a coach/i })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: /i'm a club/i })).toBeVisible({ timeout: 20000 })
  })

  test('opportunities page loads (public/indexable)', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 20000 })
  })
})
