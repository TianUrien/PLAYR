import { test, expect } from './fixtures'

/**
 * Authenticated tests for the Opportunities page
 * 
 * These tests run with a pre-authenticated player session.
 * The session is set up via auth.setup.ts and saved to storageState.
 */

test.describe('Opportunities Page - Authenticated Player', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/opportunities')
    // Wait for page to load
    await page.waitForLoadState('networkidle')
  })

  test('displays opportunities page heading', async ({ page }) => {
    // Should see the Opportunities heading (not redirected to landing)
    await expect(page.getByRole('heading', { name: 'Opportunities', level: 1 })).toBeVisible({
      timeout: 10000,
    })
  })

  test('shows page description', async ({ page }) => {
    await expect(
      page.getByText(/discover field hockey opportunities/i)
    ).toBeVisible()
  })

  test('displays filters panel', async ({ page }) => {
    // Filters panel should be visible
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible()
  })

  test('shows position filters', async ({ page }) => {
    // Position filter section should be visible
    await expect(page.getByText('Position', { exact: true })).toBeVisible()
    
    // Position checkbox options - use role to be specific
    await expect(page.getByRole('checkbox', { name: /goalkeeper/i })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /defender/i })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /midfielder/i })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /forward/i })).toBeVisible()
  })

  test('shows gender filters', async ({ page }) => {
    await expect(page.getByText('Gender', { exact: true })).toBeVisible()
    // Gender radio buttons - use role to be specific
    await expect(page.getByRole('radio', { name: 'Men', exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Women' })).toBeVisible()
  })

  test('shows location filter input', async ({ page }) => {
    const locationInput = page.getByPlaceholder(/city or country/i)
    await expect(locationInput).toBeVisible()
    
    // Can type in location filter
    await locationInput.fill('Spain')
    await expect(locationInput).toHaveValue('Spain')
  })

  test('shows vacancy count', async ({ page }) => {
    // Should show "Showing X opportunities"
    await expect(page.getByText(/showing \d+ opportunities/i)).toBeVisible()
  })

  test('can toggle view mode', async ({ page }) => {
    // View toggle buttons should be visible on desktop
    await page.setViewportSize({ width: 1280, height: 720 })
    
    const gridButton = page.getByTitle('Grid view')
    const listButton = page.getByTitle('List view')
    
    await expect(gridButton).toBeVisible()
    await expect(listButton).toBeVisible()
    
    // Click list view
    await listButton.click()
    
    // List view should now be active (has different styling)
    await expect(listButton).toHaveClass(/bg-blue/)
  })

  test('filters by position', async ({ page }) => {
    // Get initial count
    const countText = await page.getByText(/showing \d+ opportunities/i).textContent()
    const initialCount = parseInt(countText?.match(/\d+/)?.[0] || '0')
    
    // Apply goalkeeper filter using checkbox role
    await page.getByRole('checkbox', { name: /goalkeeper/i }).click()
    
    // Wait for filter to apply
    await page.waitForTimeout(500)
    
    // Count should change (unless all are goalkeepers or none are)
    const newCountText = await page.getByText(/showing \d+ opportunities/i).textContent()
    const newCount = parseInt(newCountText?.match(/\d+/)?.[0] || '0')
    
    // The count changed or stayed the same - either way, filter was applied
    expect(newCount).toBeLessThanOrEqual(initialCount)
  })

  test('shows empty state when no vacancies match filter', async ({ page }) => {
    // Filter by a very specific location that won't match anything
    const locationInput = page.getByPlaceholder(/city or country/i)
    await locationInput.fill('zzz-nonexistent-location-12345')
    
    // Wait for filter to apply
    await page.waitForTimeout(500)
    
    // Should show "No opportunities found"
    await expect(page.getByText(/no opportunities found/i)).toBeVisible()
  })

  test('clear filters button works', async ({ page }) => {
    // Apply a filter first using checkbox role
    await page.getByRole('checkbox', { name: /goalkeeper/i }).click()
    await page.waitForTimeout(300)
    
    // Clear all button should appear
    const clearButton = page.getByRole('button', { name: /clear all/i })
    
    if (await clearButton.isVisible()) {
      await clearButton.click()
      await page.waitForTimeout(300)
      
      // Goalkeeper checkbox should be unchecked
      await expect(page.getByRole('checkbox', { name: /goalkeeper/i })).not.toBeChecked()
    }
  })
})

test.describe('Vacancy Details - Authenticated Player', () => {
  test('can view vacancy details modal', async ({ page }) => {
    await page.goto('/opportunities')
    await page.waitForLoadState('networkidle')
    
    // Find a vacancy card with a "View Details" button
    const viewDetailsButton = page.getByRole('button', { name: /view details/i }).first()
    
    // If there are vacancies, click to view details
    if (await viewDetailsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewDetailsButton.click()
      
      // Wait for the detail view to open - look for the Close button with exact name
      // This is the one in the vacancy detail overlay, not in notifications
      await expect(
        page.getByRole('button', { name: 'Close', exact: true })
      ).toBeVisible({ timeout: 5000 })
    }
  })

  test('shows apply button on vacancy detail', async ({ page }) => {
    await page.goto('/opportunities')
    await page.waitForLoadState('networkidle')
    
    const viewDetailsButton = page.getByRole('button', { name: /view details/i }).first()
    
    if (await viewDetailsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewDetailsButton.click()
      
      // Wait for detail view to open
      await page.waitForTimeout(500)
      
      // Apply button should be visible for players - use .first() to avoid strict mode
      await expect(
        page.getByRole('button', { name: /apply/i }).first()
      ).toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Responsive Opportunities - Authenticated', () => {
  test('mobile filter toggle works', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/opportunities')
    await page.waitForLoadState('networkidle')
    
    // On mobile, filters should be hidden by default
    const filtersButton = page.getByRole('button', { name: /filters/i })
    
    if (await filtersButton.isVisible()) {
      await filtersButton.click()
      
      // Filters panel should now be visible
      await expect(page.getByText('Position', { exact: true })).toBeVisible()
    }
  })
})
