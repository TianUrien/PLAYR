import { test, expect } from './fixtures'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

type SeededVacancyData = {
  id: string | null
  title: string
  clubId: string
}

function readSeededVacancy(): SeededVacancyData {
  const filePath = path.join(__dirname, '.data', 'vacancy.json')
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw) as SeededVacancyData
}

test.describe('@smoke club', () => {
  test('club can open applicants page for seeded vacancy', async ({ page }) => {
    const seeded = readSeededVacancy()
    expect(seeded.id, 'Seeded vacancy id should be written by auth.setup').toBeTruthy()

    await page.goto(`/dashboard/club/vacancies/${seeded.id}/applicants`)

    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(`Applicants for ${seeded.title}`, 'i') })
    ).toBeVisible({ timeout: 20000 })

    // Either the empty state or some applicants count should show
    const emptyState = page.getByRole('heading', { level: 3, name: 'No Applicants Yet' })
    const hasEmptyOrApplicants = await emptyState.isVisible() || await page.getByText(/\d+\s+applicants?/i).first().isVisible()
    expect(hasEmptyOrApplicants).toBe(true)
  })
})
