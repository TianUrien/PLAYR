import { test, expect } from './fixtures'

test.describe('Opportunities - Public', () => {
  test('allows unauthenticated users to browse opportunities', async ({ page }) => {
    await page.goto('/opportunities')

    // Should stay on opportunities page (publicly accessible)
    await expect(page).toHaveURL('/opportunities')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('shows sign-in prompt when unauthenticated user tries to apply', async ({ page }) => {
    await page.goto('/opportunities')
    await expect(page).toHaveURL('/opportunities')
    await expect(page.getByRole('main')).toBeVisible()

    // If there is at least one vacancy card rendered, clicking Apply opens the sign-in prompt modal
    const applyButtons = page.getByRole('button', { name: 'Apply Now' })
    if (await applyButtons.first().isVisible().catch(() => false)) {
      await applyButtons.first().click()
      await expect(page.getByRole('heading', { level: 2, name: 'Sign in to apply' })).toBeVisible()
    }
  })
})

test.describe('Opportunities - Accessibility', () => {
  test('opportunities page is keyboard navigable', async ({ page }) => {
    await page.goto('/opportunities')
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 10000 })

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test('opportunity action buttons are focusable', async ({ page }) => {
    await page.goto('/opportunities')
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 10000 })

    // Apply Now is the primary action button on opportunity cards
    const applyButton = page.getByRole('button', { name: 'Apply Now' }).first()

    if (await applyButton.isVisible().catch(() => false)) {
      await applyButton.focus()
      await expect(applyButton).toBeFocused()
    }
  })
})

test.describe('Responsive Vacancy Display', () => {
  test('opportunities page works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/opportunities')
    await expect(page).toHaveURL('/opportunities')
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 10000 })
  })

  test('opportunities page works on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/opportunities')
    await expect(page).toHaveURL('/opportunities')
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 10000 })
  })

  test('opportunities page works on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/opportunities')
    await expect(page).toHaveURL('/opportunities')
    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 10000 })
  })
})
