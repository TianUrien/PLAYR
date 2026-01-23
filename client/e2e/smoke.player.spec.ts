import { test, expect } from './fixtures'

const E2E_CLUB_USERNAME = 'e2e-test-fc'
const E2E_VACANCY_TITLE = 'E2E Vacancy - Automated Test'

async function getE2EVacancyCard(page: import('@playwright/test').Page) {
  const titleHeading = page.getByRole('heading', { level: 2, name: E2E_VACANCY_TITLE })
  return titleHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first()
}

test.describe('@smoke player', () => {
  test('dashboard loads for authenticated player', async ({ page }) => {
    await page.goto('/dashboard/profile')

    // Debug: Check localStorage after navigation (must be on a real page, not about:blank)
    const authData = await page.evaluate(() => {
      const raw = localStorage.getItem('playr-auth')
      if (!raw) return { error: 'No playr-auth in localStorage' }
      try {
        const parsed = JSON.parse(raw)
        return {
          hasAccessToken: !!parsed.access_token,
          hasRefreshToken: !!parsed.refresh_token,
          expiresAt: parsed.expires_at,
          userId: parsed.user?.id,
          userEmail: parsed.user?.email,
        }
      } catch (e) {
        return { error: 'Failed to parse', raw: raw.slice(0, 100) }
      }
    })
    console.log('[E2E Debug] Auth data in localStorage:', JSON.stringify(authData, null, 2))

    // Wait a bit for the app to initialize
    await page.waitForTimeout(2000)

    // Debug: Check what the app shows
    const pageContent = await page.content()
    if (pageContent.includes('No profile found')) {
      console.log('[E2E Debug] Page shows "No profile found" - auth may not be working')
      // Take screenshot
      await page.screenshot({ path: 'e2e-debug-no-profile.png' })
    }

    // Basic signal that profile dashboard rendered (check for profile name heading)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 })
  })

  test('player can open seeded vacancy details', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()

    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible({ timeout: 20000 })

    const card = await getE2EVacancyCard(page)
    await expect(card).toBeVisible({ timeout: 20000 })

    await card.getByRole('button', { name: new RegExp(`View details for ${E2E_VACANCY_TITLE}`, 'i') }).click()

    await expect(page.getByRole('heading', { level: 1, name: E2E_VACANCY_TITLE })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible({ timeout: 20000 })

    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: E2E_VACANCY_TITLE })).not.toBeVisible({ timeout: 20000 })
  })

  test('player can start a message from a club profile', async ({ page }) => {
    await page.goto(`/clubs/${E2E_CLUB_USERNAME}`)

    await expect(page.getByRole('heading', { level: 1, name: /e2e test fc/i })).toBeVisible({ timeout: 20000 })

    // Avoid strict-mode ambiguity with the "Messages" nav button.
    await page.getByRole('button', { name: 'Message', exact: true }).click()

    // Messaging page should load
    await expect(page).toHaveURL(/\/messages/i, { timeout: 20000 })
    await expect(page.getByPlaceholder(/type a message/i)).toBeVisible({ timeout: 20000 })
  })

  test('player can send a message and see it in the thread', async ({ page }) => {
    await page.goto(`/clubs/${E2E_CLUB_USERNAME}`)
    await expect(page.getByRole('heading', { level: 1, name: /e2e test fc/i })).toBeVisible({ timeout: 20000 })

    // Avoid strict-mode ambiguity with the "Messages" nav button.
    await page.getByRole('button', { name: 'Message', exact: true }).click()
    await expect(page).toHaveURL(/\/messages/i, { timeout: 20000 })

    const message = `E2E smoke message ${Date.now()}`
    const textarea = page.getByPlaceholder(/type a message/i)
    await textarea.fill(message)
    await page.keyboard.press('Enter')

    const messageList = page.getByTestId('chat-message-list')
    await expect(messageList.getByText(message)).toBeVisible({ timeout: 20000 })
  })
})
