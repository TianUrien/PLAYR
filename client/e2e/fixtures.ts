import { test as base, expect, Page } from '@playwright/test'

/**
 * Test fixtures and helpers for PLAYR E2E tests
 * 
 * IMPORTANT: These are dedicated E2E test accounts, separate from manual test accounts.
 * E2E accounts: e2e-*@playr.test (automated testing only)
 * Manual accounts: Gmail-based accounts for human testing
 */

// Test user credentials for E2E testing
export const TEST_USERS = {
  player: {
    email: process.env.E2E_PLAYER_EMAIL || 'e2e-player@playr.test',
    password: process.env.E2E_PLAYER_PASSWORD || 'Hola1234',
    fullName: 'E2E Test Player',
    nationality: 'United Kingdom',
    baseLocation: 'London, UK',
    position: 'midfielder',
  },
  club: {
    email: process.env.E2E_CLUB_EMAIL || 'e2e-club@playr.test',
    password: process.env.E2E_CLUB_PASSWORD || 'Hola1234',
    clubName: 'E2E Test FC',
    baseLocation: 'Manchester, UK',
    country: 'United Kingdom',
  },
  coach: {
    email: process.env.E2E_COACH_EMAIL || 'e2e-coach@playr.test',
    password: process.env.E2E_COACH_PASSWORD || 'Hola1234',
    fullName: 'E2E Test Coach',
    nationality: 'United Kingdom',
    baseLocation: 'Birmingham, UK',
    position: 'Head Coach',
  },
} as const

/**
 * Page Object Model for common page interactions
 */
export class PlayrPage {
  constructor(public page: Page) {}

  // Navigation helpers
  async goto(path: string) {
    await this.page.goto(path)
  }

  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle')
  }

  // Auth helpers
  async isLoggedIn() {
    // Check for presence of avatar or dashboard link
    return await this.page.locator('[aria-label="Open user menu"], [data-testid="user-avatar"]').isVisible()
  }

  async logout() {
    await this.page.locator('[aria-label="Open user menu"]').click()
    await this.page.getByRole('menuitem', { name: /sign out/i }).click()
    await this.waitForNavigation()
  }

  // Toast helpers
  async expectToast(message: string | RegExp) {
    await expect(this.page.locator('[role="status"]').filter({ hasText: message })).toBeVisible({
      timeout: 10000,
    })
  }

  async expectNoErrors() {
    await expect(this.page.locator('[role="alert"]')).not.toBeVisible()
  }

  // Loading helpers
  async waitForLoadingToComplete() {
    // Wait for any spinners to disappear
    await this.page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 30000 }).catch(() => {
      // No spinner found, that's fine
    })
  }
}

/**
 * Page Object for Landing/Auth pages
 */
export class AuthPage extends PlayrPage {
  async clickSignUp() {
    await this.page.getByRole('link', { name: /join playr/i }).click()
  }

  async selectRole(role: 'player' | 'coach' | 'club') {
    const roleLabels = {
      player: /i'm a player/i,
      coach: /i'm a coach/i,
      club: /i'm a club/i,
    }
    await this.page.getByRole('button', { name: roleLabels[role] }).click()
  }

  async fillSignUpForm(email: string) {
    await this.page.getByLabel(/email/i).fill(email)
    await this.page.getByRole('button', { name: /continue|sign up|get started/i }).click()
  }

  async signInWithEmail(email: string) {
    await this.page.goto('/')
    await this.page.getByLabel(/email/i).fill(email)
    await this.page.getByRole('button', { name: /sign in|continue/i }).click()
  }
}

/**
 * Page Object for Profile Completion
 */
export class ProfilePage extends PlayrPage {
  async fillPlayerProfile(data: typeof TEST_USERS.player) {
    await this.page.getByLabel(/full name/i).fill(data.fullName)
    await this.page.getByLabel(/nationality/i).fill(data.nationality)
    await this.page.getByLabel(/base location|city/i).fill(data.baseLocation)
    
    // Select position from dropdown if present
    const positionSelect = this.page.getByLabel(/position/i)
    if (await positionSelect.isVisible()) {
      await positionSelect.selectOption({ label: data.position })
    }
  }

  async fillClubProfile(data: typeof TEST_USERS.club) {
    await this.page.getByLabel(/club name|name/i).fill(data.clubName)
    await this.page.getByLabel(/location|city/i).fill(data.baseLocation)
    await this.page.getByLabel(/country/i).fill(data.country)
  }

  async submitProfile() {
    await this.page.getByRole('button', { name: /save|complete|submit|continue/i }).click()
    await this.waitForNavigation()
  }
}

/**
 * Page Object for Messaging
 */
export class MessagesPage extends PlayrPage {
  async openMessagesPage() {
    await this.page.goto('/messages')
    await this.waitForLoadingToComplete()
  }

  async selectConversation(participantName: string) {
    await this.page.getByText(participantName).click()
    await this.waitForLoadingToComplete()
  }

  async sendMessage(content: string) {
    const textarea = this.page.getByPlaceholder(/type a message/i)
    await textarea.fill(content)
    await this.page.keyboard.press('Enter')
  }

  async expectMessage(content: string) {
    await expect(this.page.locator('[data-testid="chat-message-list"]').getByText(content)).toBeVisible({
      timeout: 10000,
    })
  }

  async startNewConversation(recipientId: string) {
    await this.page.goto(`/messages?new=${recipientId}`)
    await this.waitForLoadingToComplete()
  }
}

/**
 * Page Object for Opportunities/Vacancies
 */
export class OpportunitiesPage extends PlayrPage {
  async openOpportunitiesPage() {
    await this.page.goto('/opportunities')
    await this.waitForLoadingToComplete()
  }

  async filterByLocation(location: string) {
    await this.page.getByPlaceholder(/city or country/i).fill(location)
    await this.waitForLoadingToComplete()
  }

  async openVacancyDetails(title: string) {
    await this.page.getByText(title).click()
    await this.waitForLoadingToComplete()
  }

  async applyToVacancy() {
    await this.page.getByRole('button', { name: /apply now/i }).click()
  }

  async confirmApplication(message?: string) {
    if (message) {
      await this.page.getByLabel(/message|cover letter/i).fill(message)
    }
    await this.page.getByRole('button', { name: /submit|apply|confirm/i }).click()
    await this.waitForNavigation()
  }

  async expectApplicationConfirmation() {
    await expect(
      this.page.getByText(/application submitted|applied|success/i)
    ).toBeVisible({ timeout: 10000 })
  }
}

/**
 * Page Object for Community Page
 */
export class CommunityPage extends PlayrPage {
  async openCommunityPage() {
    await this.page.goto('/community')
    await this.waitForLoadingToComplete()
  }

  async searchProfiles(query: string) {
    await this.page.getByPlaceholder(/search/i).fill(query)
    await this.waitForLoadingToComplete()
  }

  async openProfile(name: string) {
    await this.page.getByText(name).click()
    await this.waitForLoadingToComplete()
  }

  async startConversation() {
    await this.page.getByRole('button', { name: /message/i }).click()
  }
}

/**
 * Extended test fixture with page objects
 */
export const test = base.extend<{
  authPage: AuthPage
  profilePage: ProfilePage
  messagesPage: MessagesPage
  opportunitiesPage: OpportunitiesPage
  communityPage: CommunityPage
}>({
  authPage: async ({ page }, use) => {
    await use(new AuthPage(page))
  },
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page))
  },
  messagesPage: async ({ page }, use) => {
    await use(new MessagesPage(page))
  },
  opportunitiesPage: async ({ page }, use) => {
    await use(new OpportunitiesPage(page))
  },
  communityPage: async ({ page }, use) => {
    await use(new CommunityPage(page))
  },
})

export { expect }
