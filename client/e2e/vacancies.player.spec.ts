import { test, expect } from './fixtures'

const E2E_VACANCY_TITLE = 'E2E Vacancy - Automated Test'

async function getE2EVacancyCard(page: import('@playwright/test').Page) {
  const titleHeading = page.getByRole('heading', { level: 2, name: E2E_VACANCY_TITLE })
  return titleHeading.locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first()
}

test.describe('Vacancy Application Flow - Player', () => {
  test('authenticated player sees opportunities and the seeded E2E vacancy', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()

    await expect(page.getByRole('heading', { level: 1, name: 'Opportunities' })).toBeVisible()

    const card = await getE2EVacancyCard(page)
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card.getByRole('heading', { level: 2, name: E2E_VACANCY_TITLE })).toBeVisible()
    // Location city is shown in the card body, country is in the banner
    await expect(card.getByText('London')).toBeVisible()
    await expect(card.getByText(/UNITED KINGDOM/i)).toBeVisible()
  })

  test('filters can narrow results deterministically', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()

    // Position filter: midfielder should keep our vacancy visible
    await page.getByRole('checkbox', { name: 'midfielder' }).check()
    await expect(page.getByRole('heading', { level: 2, name: E2E_VACANCY_TITLE })).toBeVisible({ timeout: 20000 })

    // Gender filter: selecting Women should hide our Men vacancy
    await page.getByRole('radio', { name: 'Women' }).check()
    await expect(page.getByRole('heading', { level: 2, name: E2E_VACANCY_TITLE })).not.toBeVisible({ timeout: 10000 })

    // Location filter: nonsense should show empty state
    await page.getByRole('textbox', { name: 'City or Country' }).fill('zzz-nonexistent-location-xyz')
    await expect(page.getByRole('heading', { level: 3, name: 'No opportunities found' })).toBeVisible({ timeout: 20000 })
  })

  test('player can open vacancy details view', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()

    const card = await getE2EVacancyCard(page)
    await expect(card).toBeVisible({ timeout: 20000 })

    await card.getByRole('button', { name: new RegExp(`View details for ${E2E_VACANCY_TITLE}`, 'i') }).click()

    // Detail view uses a fixed overlay (not role=dialog), but it has a close button and an H1 title.
      await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { level: 1, name: E2E_VACANCY_TITLE })).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('heading', { level: 2, name: 'About This Opportunity' })).toBeVisible()

    // Close it
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: E2E_VACANCY_TITLE })).not.toBeVisible({ timeout: 20000 })
  })

  test('player can open apply modal and submit application', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()

    // Wait for content to settle (vacancies fetch + render)
    await opportunitiesPage.waitForLoadingToComplete()

    const card = await getE2EVacancyCard(page)

    await expect(card).toBeVisible({ timeout: 20000 })

    // If the player has already applied (e.g. from a previous run), we're done.
    const appliedButton = card.getByRole('button', { name: /applied/i })
    if (await appliedButton.isVisible().catch(() => false)) {
      await expect(appliedButton).toBeVisible()
      return
    }

    // Open apply modal
    await card.getByRole('button', { name: 'Apply Now' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { level: 2, name: 'Apply to Position' })).toBeVisible()
    await expect(dialog.getByText(E2E_VACANCY_TITLE)).toBeVisible()

    // Submit application (idempotent: duplicate applications are treated as success)
    await dialog.getByRole('button', { name: 'Submit Application' }).click()

    await opportunitiesPage.expectToast(/Application (submitted successfully|confirmed)!/i)

    // Card should flip into "Applied" state after success
    await expect(card.getByRole('button', { name: /applied/i })).toBeVisible({ timeout: 20000 })
  })
})
