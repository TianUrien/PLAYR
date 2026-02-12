import { test, expect } from './fixtures'

test.describe('highlight video visibility toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/profile')
    // Wait for the dashboard to fully load
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 30000 }).catch(() => {})
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 })
  })

  test('visibility toggle appears below highlight video', async ({ page }) => {
    // Check for the video player or the empty state
    const hasVideo = await page.getByTitle('Highlight video player').isVisible().catch(() => false)

    if (!hasVideo) {
      // Skip this test if the test player doesn't have a highlight video
      test.skip()
      return
    }

    // The toggle should be visible in edit mode
    const toggle = page.getByLabel(/recruiters only/i)
    await expect(toggle).toBeVisible({ timeout: 10000 })
  })

  test('player can restrict video to recruiters only', async ({ page }) => {
    const hasVideo = await page.getByTitle('Highlight video player').isVisible().catch(() => false)
    if (!hasVideo) {
      test.skip()
      return
    }

    const toggle = page.getByLabel(/recruiters only/i)
    const isAlreadyChecked = await toggle.isChecked()

    // If already restricted, reset to public first
    if (isAlreadyChecked) {
      await toggle.click()
      await expect(
        page.locator('[role="status"], [role="alert"]').filter({ hasText: /visible to everyone/i })
      ).toBeVisible({ timeout: 10000 })
      // Wait for the toast to dismiss
      await page.waitForTimeout(1500)
    }

    // Toggle to recruiters only
    await toggle.click()

    // Should show success toast
    await expect(
      page.locator('[role="status"], [role="alert"]').filter({ hasText: /restricted to recruiters/i })
    ).toBeVisible({ timeout: 10000 })

    // Helper text should update
    await expect(page.getByText(/only clubs and coaches can see/i)).toBeVisible()

    // Checkbox should be checked
    await expect(toggle).toBeChecked()
  })

  test('visibility toggle persists after page reload', async ({ page }) => {
    // Skip on mobile to avoid race with desktop worker modifying the same profile state
    if ((page.viewportSize()?.width ?? 1280) < 768) {
      test.skip()
      return
    }

    const hasVideo = await page.getByTitle('Highlight video player').isVisible().catch(() => false)
    if (!hasVideo) {
      test.skip()
      return
    }

    const toggle = page.getByLabel(/recruiters only/i)
    const wasChecked = await toggle.isChecked()

    // Toggle the state and wait for the API response to confirm persistence
    const updatePromise = page.waitForResponse(
      resp => resp.url().includes('rest/v1/profiles') && resp.request().method() === 'PATCH' && resp.status() < 400,
      { timeout: 15000 }
    )
    await toggle.click()
    await updatePromise

    // Wait for the success toast to confirm UI update
    await expect(
      page.locator('[role="status"], [role="alert"]').filter({ hasText: wasChecked ? /visible to everyone/i : /restricted to recruiters/i })
    ).toBeVisible({ timeout: 10000 })

    // Reload the page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 })

    // Toggle should reflect the new state
    const toggleAfterReload = page.getByLabel(/recruiters only/i)
    await expect(toggleAfterReload).toBeVisible({ timeout: 15000 })
    if (wasChecked) {
      await expect(toggleAfterReload).not.toBeChecked({ timeout: 10000 })
    } else {
      await expect(toggleAfterReload).toBeChecked({ timeout: 10000 })
    }

    // Restore original state and wait for persistence
    const restorePromise = page.waitForResponse(
      resp => resp.url().includes('rest/v1/profiles') && resp.request().method() === 'PATCH' && resp.status() < 400,
      { timeout: 15000 }
    )
    await toggleAfterReload.click()
    await restorePromise
  })

  test('player can switch back to public visibility', async ({ page }) => {
    const hasVideo = await page.getByTitle('Highlight video player').isVisible().catch(() => false)
    if (!hasVideo) {
      test.skip()
      return
    }

    const toggle = page.getByLabel(/recruiters only/i)

    // Ensure it's restricted first
    if (!(await toggle.isChecked())) {
      await toggle.click()
      await expect(
        page.locator('[role="status"], [role="alert"]').filter({ hasText: /restricted to recruiters/i })
      ).toBeVisible({ timeout: 10000 })
      await page.waitForTimeout(1500)
    }

    // Toggle back to public
    await toggle.click()

    // Should show success toast
    await expect(
      page.locator('[role="status"], [role="alert"]').filter({ hasText: /visible to everyone/i })
    ).toBeVisible({ timeout: 10000 })

    // Helper text should update
    await expect(page.getByText(/your highlight video is visible to everyone/i)).toBeVisible()

    // Checkbox should be unchecked
    await expect(toggle).not.toBeChecked()
  })

  test('toggle does not appear when no video exists', async ({ page }) => {
    const hasVideo = await page.getByTitle('Highlight video player').isVisible().catch(() => false)

    if (hasVideo) {
      // This test only applies when there's no video — skip if there is one
      test.skip()
      return
    }

    // The empty state should show
    await expect(page.getByText(/no highlight video yet/i)).toBeVisible()

    // No toggle should be present
    await expect(page.getByLabel(/recruiters only/i)).not.toBeVisible()
  })
})
