import { test, expect } from './fixtures'

test.describe('Dashboard Menu - Mobile', () => {
  test('hamburger menu dropdown is visible and not clipped (mobile viewport)', async ({ page }) => {
    const viewport = { width: 390, height: 844 }
    await page.setViewportSize(viewport)

    await page.goto('/dashboard/profile')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20000 })

    // Dismiss the notifications drawer if it's truly open
    const notifDialog = page.locator('[role="dialog"][aria-label="Notifications"]')
    if (await notifDialog.count() > 0 && await notifDialog.getAttribute('aria-modal') === 'true') {
      await page.getByRole('button', { name: 'Close notifications' }).click()
      await expect(notifDialog).not.toHaveAttribute('aria-modal', 'true', { timeout: 5000 })
    }

    // Open the hamburger menu
    await page.getByRole('button', { name: 'Open menu' }).click()

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible({ timeout: 20000 })
    await expect(menu.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Sign Out' })).toBeVisible()

    // Ensure the menu is within the viewport (guards against off-screen rendering on mobile)
    const box = await menu.boundingBox()
    expect(box, 'Menu should have a bounding box').not.toBeNull()

    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
  })
})
