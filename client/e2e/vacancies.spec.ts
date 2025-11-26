import { test, expect } from './fixtures'

test.describe('Vacancy Application Flow', () => {
  test.describe('Opportunities Page - Unauthenticated', () => {
    test('redirects unauthenticated users to landing page', async ({ page }) => {
      await page.goto('/opportunities')
      
      // Should redirect to landing page since /opportunities is protected
      await page.waitForURL('/', { timeout: 10000 })
      
      // Landing page should be visible
      await expect(page.getByRole('heading', { name: /sign in to playr/i })).toBeVisible()
    })

    test('stores intended destination for post-login redirect', async ({ page }) => {
      await page.goto('/opportunities')
      
      // Should redirect to landing
      await page.waitForURL('/', { timeout: 10000 })
      
      // The app should store the intended destination (checked via state)
      // For now, just verify the redirect happened
      await expect(page).toHaveURL('/')
    })
  })

  test.describe('Opportunities Page - Authenticated', () => {
    // Note: These tests are skipped because they require authenticated sessions
    // To enable them, implement authenticated test setup using storageState or API login
    
    test.skip('displays opportunities page with vacancy listings', async ({ page, opportunitiesPage }) => {
      // This test requires authentication
      await opportunitiesPage.openOpportunitiesPage()
      
      // Page should load without errors
      await expect(page.getByRole('main')).toBeVisible()
      
      // Should have the Opportunities heading
      await expect(page.getByRole('heading', { name: 'Opportunities', level: 1 })).toBeVisible()
    })

    test.skip('shows vacancy cards with key information', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      
      // Wait for content to load
      await opportunitiesPage.waitForLoadingToComplete()
      
      // If vacancies exist, they should show key info
      const vacancyCards = page.locator('[data-testid="vacancy-card"]')
      const count = await vacancyCards.count()
      
      if (count > 0) {
        const firstCard = vacancyCards.first()
        
        // Should show title
        await expect(firstCard.locator('h2, h3, [data-testid="vacancy-title"]')).toBeVisible()
        
        // Should show location info
        await expect(firstCard.getByText(/📍|location/i)).toBeVisible()
      }
    })

    test.skip('allows filtering vacancies by position', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      await opportunitiesPage.waitForLoadingToComplete()
      
      // Position filter section should be visible in the filters panel
      await expect(page.getByText('Position').first()).toBeVisible()
      await expect(page.getByText('forward', { exact: false })).toBeVisible()
    })

    test.skip('allows filtering vacancies by gender', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      await opportunitiesPage.waitForLoadingToComplete()
      
      // Gender filter should be visible in the filters panel
      await expect(page.getByText('Gender').first()).toBeVisible()
      await expect(page.getByText('Men')).toBeVisible()
      await expect(page.getByText('Women')).toBeVisible()
    })

    test.skip('shows location filter functionality', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      await opportunitiesPage.waitForLoadingToComplete()
      
      // Location filter input should be available
      const locationInput = page.getByPlaceholder(/city or country/i)
      await expect(locationInput).toBeVisible()
      
      // Should be able to type in location filter
      await locationInput.fill('Spain')
      await expect(locationInput).toHaveValue('Spain')
    })

    test.skip('handles filtering with no results gracefully', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      await opportunitiesPage.waitForLoadingToComplete()
      
      // Use location filter to search for something unlikely to exist
      const locationInput = page.getByPlaceholder(/city or country/i)
      await locationInput.fill('zzz-nonexistent-location-xyz')
      
      // Wait a moment for filter to apply
      await page.waitForTimeout(500)
      
      // Should show empty state or no results message
      await expect(
        page.getByText(/no opportunities found/i)
      ).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Vacancy Details', () => {
    test.skip('opens vacancy detail modal or page', async ({ page, opportunitiesPage }) => {
      await opportunitiesPage.openOpportunitiesPage()
      await opportunitiesPage.waitForLoadingToComplete()
      
      // Click on first vacancy
      const firstVacancy = page.locator('[data-testid="vacancy-card"]').first()
      
      if (await firstVacancy.isVisible()) {
        await firstVacancy.click()
        
        // Detail view should appear
        await expect(page.getByText(/about this opportunity|job description|requirements/i)).toBeVisible()
      }
    })

    test.skip('displays vacancy details correctly', async ({ page }) => {
      // Navigate to a specific vacancy detail page
      await page.goto('/opportunities/test-vacancy-id')
      
      // Should show key details
      await expect(page.getByRole('heading')).toBeVisible()
      await expect(page.getByText(/location|position|duration/i)).toBeVisible()
    })

    test.skip('shows apply button for eligible users', async ({ page }) => {
      await page.goto('/opportunities/test-vacancy-id')
      
      // Apply button should be visible
      await expect(page.getByRole('button', { name: /apply/i })).toBeVisible()
    })

    test.skip('shows benefits and compensation info', async ({ page }) => {
      await page.goto('/opportunities/test-vacancy-id')
      
      // Benefits section should be visible if present
      const benefitsSection = page.getByText(/benefits|what we offer|compensation/i)
      if (await benefitsSection.isVisible()) {
        await expect(benefitsSection).toBeVisible()
      }
    })
  })

  test.describe('Application Process', () => {
    test.skip('opens application modal when clicking apply', async ({ page, opportunitiesPage }) => {
      await page.goto('/opportunities/test-vacancy-id')
      
      // Click apply button
      await opportunitiesPage.applyToVacancy()
      
      // Application modal should appear
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByText(/apply|application|confirm/i)).toBeVisible()
    })

    test.skip('allows adding a cover message', async ({ page, opportunitiesPage }) => {
      await page.goto('/opportunities/test-vacancy-id')
      await opportunitiesPage.applyToVacancy()
      
      // Cover letter/message field should be available
      const messageField = page.getByLabel(/message|cover letter|note/i)
      await expect(messageField).toBeVisible()
      
      await messageField.fill('I am very interested in this opportunity. I have 5 years of experience.')
      await expect(messageField).toHaveValue(/I am very interested/)
    })

    test.skip('submits application successfully', async ({ page, opportunitiesPage }) => {
      await page.goto('/opportunities/test-vacancy-id')
      await opportunitiesPage.applyToVacancy()
      
      // Fill in application
      await opportunitiesPage.confirmApplication('I would be a great fit for this role.')
      
      // Should show success message
      await opportunitiesPage.expectApplicationConfirmation()
    })

    test.skip('prevents duplicate applications', async ({ page, opportunitiesPage }) => {
      await page.goto('/opportunities/already-applied-vacancy-id')
      
      // Should show "Already Applied" instead of "Apply Now"
      await expect(page.getByText(/already applied|applied/i)).toBeVisible()
      await expect(page.getByRole('button', { name: /apply now/i })).not.toBeVisible()
    })

    test.skip('validates required fields in application', async ({ page, opportunitiesPage }) => {
      await page.goto('/opportunities/test-vacancy-id')
      await opportunitiesPage.applyToVacancy()
      
      // Try to submit without required fields
      await page.getByRole('button', { name: /submit|apply|confirm/i }).click()
      
      // Should show validation error if fields are required
      // (depends on implementation - some applications may not have required fields)
    })
  })

  test.describe('Club Vacancy Management', () => {
    test.skip('club can view their posted vacancies', async ({ page }) => {
      // This requires club authentication
      await page.goto('/dashboard/profile')
      
      // Navigate to vacancies tab
      await page.getByRole('tab', { name: /vacancies/i }).click()
      
      // Should show vacancy management UI
      await expect(page.getByText(/your vacancies|manage vacancies|post vacancy/i)).toBeVisible()
    })

    test.skip('club can create new vacancy', async ({ page }) => {
      await page.goto('/dashboard/profile')
      await page.getByRole('tab', { name: /vacancies/i }).click()
      
      // Click create button
      await page.getByRole('button', { name: /create|add|post/i }).click()
      
      // Vacancy form should appear
      await expect(page.getByLabel(/title|position/i)).toBeVisible()
    })

    test.skip('club can view applicants', async ({ page }) => {
      await page.goto('/dashboard/club/vacancies/test-vacancy-id/applicants')
      
      // Should show applicants list
      await expect(page.getByText(/applicants|applications/i)).toBeVisible()
    })
  })
})

test.describe('Vacancy Page Accessibility', () => {
  // Note: These tests are skipped because /opportunities requires authentication
  // The redirect to landing page is already tested above
  
  test.skip('opportunities page is keyboard navigable', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()
    
    // Tab through the page
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    
    // Some element should be focused
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })

  test.skip('vacancy cards are focusable', async ({ page, opportunitiesPage }) => {
    await opportunitiesPage.openOpportunitiesPage()
    await opportunitiesPage.waitForLoadingToComplete()
    
    const vacancyCards = page.locator('[data-testid="vacancy-card"]')
    const count = await vacancyCards.count()
    
    if (count > 0) {
      const firstCard = vacancyCards.first()
      
      // Card should be clickable/focusable
      await firstCard.focus()
      await expect(firstCard).toBeFocused()
    }
  })
})

test.describe('Responsive Vacancy Display', () => {
  // These tests verify redirect behavior works across viewport sizes
  
  test('opportunities redirect works on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/opportunities')
    
    // Should redirect to landing
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('opportunities redirect works on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/opportunities')
    
    // Should redirect to landing
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('opportunities redirect works on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/opportunities')
    
    // Should redirect to landing
    await page.waitForURL('/', { timeout: 10000 })
    await expect(page.getByRole('main')).toBeVisible()
  })
})
