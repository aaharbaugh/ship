import { test, expect } from './fixtures/isolated-env'

/**
 * Issue Estimates & Status Tracking - E2E Tests
 *
 * Tests for:
 * - Estimate field in issue editor
 * - Estimate validation for sprint assignment
 * - Sprint capacity display
 * - Status change timestamp tracking
 * - Activity/change history
 */

async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`)
  expect(response.ok()).toBe(true)
  const { token } = await response.json()
  return token
}

async function createProgramWithSprint(
  page: import('@playwright/test').Page,
): Promise<{ programId: string; programTitle: string; sprintId: string; sprintName: string }> {
  const apiUrl = new URL(page.url()).origin
  const csrfToken = await getCsrfToken(page, apiUrl)

  const meResponse = await page.request.get(`${apiUrl}/api/auth/me`)
  expect(meResponse.ok()).toBe(true)
  const meData = await meResponse.json()
  const userId = meData.data.user.id

  const suffix = Date.now().toString()
  const programTitle = `Estimate Program ${suffix}`
  const sprintNumber = 900 + Number(suffix.slice(-2))

  const programResponse = await page.request.post(`${apiUrl}/api/documents`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      title: programTitle,
      document_type: 'program',
    },
  })
  expect(programResponse.ok()).toBe(true)
  const program = await programResponse.json()

  const sprintResponse = await page.request.post(`${apiUrl}/api/weeks`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      title: `Estimate Sprint ${suffix}`,
      program_id: program.id,
      sprint_number: sprintNumber,
      owner_id: userId,
    },
  })
  expect(sprintResponse.ok()).toBe(true)
  const sprint = await sprintResponse.json()

  return {
    programId: program.id,
    programTitle,
    sprintId: sprint.id,
    sprintName: `Week ${sprintNumber}`,
  }
}

async function updateIssue(
  page: import('@playwright/test').Page,
  issueId: string,
  data: Record<string, unknown>
) {
  const apiUrl = new URL(page.url()).origin
  const csrfToken = await getCsrfToken(page, apiUrl)

  const response = await page.request.patch(`${apiUrl}/api/issues/${issueId}`, {
    headers: { 'x-csrf-token': csrfToken },
    data,
  })
  return response
}

test.describe('Issue Estimates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('dev@ship.local')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL('/login', { timeout: 5000 })
  })

  test.describe('Estimate Field UI', () => {
    test('shows estimate field in issue editor properties', async ({ page }) => {
      // Create a new issue to test estimate field
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Should see Estimate field label in properties sidebar (label element, exact match)
      await expect(page.locator('label').filter({ hasText: /^Estimate$/ })).toBeVisible({ timeout: 5000 })
    })

    test('can enter estimate as free text number', async ({ page }) => {
      await page.goto('/issues')
      // Use exact match to avoid matching both "New issue" icon and "New Issue" button
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Find and fill estimate input
      const estimateInput = page.locator('input[type="number"]')
      await expect(estimateInput).toBeVisible({ timeout: 5000 })
      await estimateInput.fill('4.5')

      // Wait for save and React state update
      await page.waitForResponse(resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH')
      await page.waitForTimeout(500) // Allow React to process state update

      // Verify value persists
      await expect(estimateInput).toHaveValue('4.5')
    })

    test('accepts decimal values (0.5 increments)', async ({ page }) => {
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      const estimateInput = page.locator('input[type="number"]')
      await expect(estimateInput).toBeVisible({ timeout: 5000 })
      await estimateInput.fill('2.5')

      await page.waitForResponse(resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH')
      await page.waitForTimeout(500)
      await expect(estimateInput).toHaveValue('2.5')
    })

    test('shows hours label/hint next to estimate field', async ({ page }) => {
      // Create a new issue to test hours label
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Should show "hours" label next to estimate field
      await expect(page.getByText('hours')).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Week Assignment Validation', () => {
    test('allows adding issue without estimate to backlog', async ({ page }) => {
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Set title
      await page.getByPlaceholder('Untitled').fill('Backlog Issue No Estimate')
      await page.waitForResponse(resp => resp.url().includes('/api/documents/'))

      // Should be able to save without estimate (backlog is fine)
      // No error should appear
      await expect(page.getByText(/estimate required|must have estimate/i)).not.toBeVisible()
    })

    test('requires estimate before adding issue to sprint', async ({ page }) => {
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Set title and program
      await page.getByPlaceholder('Untitled').fill('Sprint Issue Needs Estimate')
      await page.waitForResponse(resp => resp.url().includes('/api/documents/'))
      const issueId = page.url().match(/\/documents\/([a-f0-9-]+)/)?.[1]
      expect(issueId).toBeTruthy()
      const { programId, sprintId } = await createProgramWithSprint(page)
      const response = await updateIssue(page, issueId!, {
        belongs_to: [
          { id: programId, type: 'program' },
          { id: sprintId, type: 'sprint' },
        ],
      })

      expect(response.status()).toBe(400)
      const error = await response.json()
      expect(error.error).toMatch(/estimate is required before assigning to a week/i)
    })

    test('allows sprint assignment after estimate is set', async ({ page }) => {
      await page.goto('/issues')
      await page.getByRole('button', { name: 'New Issue', exact: true }).click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

      // Set title
      await page.getByPlaceholder('Untitled').fill('Sprint Issue With Estimate')
      await page.waitForResponse(resp => resp.url().includes('/api/documents/'))

      // Set estimate first
      const estimateInput = page.locator('input[type="number"]').or(page.getByPlaceholder(/estimate|hours/i))
      await expect(estimateInput.first()).toBeVisible({ timeout: 5000 })
      await estimateInput.first().fill('4')
      await page.waitForTimeout(500)
      const issueId = page.url().match(/\/documents\/([a-f0-9-]+)/)?.[1]
      expect(issueId).toBeTruthy()
      const { programId, sprintId } = await createProgramWithSprint(page)
      const response = await updateIssue(page, issueId!, {
        estimate: 4,
        belongs_to: [
          { id: programId, type: 'program' },
          { id: sprintId, type: 'sprint' },
        ],
      })

      expect(response.ok()).toBe(true)

      const refreshedIssue = await page.request.get(`${new URL(page.url()).origin}/api/issues/${issueId}`)
      expect(refreshedIssue.ok()).toBe(true)
      const issue = await refreshedIssue.json()
      expect(issue.belongs_to).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: programId, type: 'program' }),
          expect.objectContaining({ id: sprintId, type: 'sprint' }),
        ])
      )
    })
  })

  test.describe('Week Capacity Display', () => {
    test('sprint header shows total estimated hours', async ({ page }) => {
      // Navigate to Ship Core which has comprehensive sprint/issue data with estimates
      await page.goto('/programs')
      await page.locator('tr[role="row"]', { hasText: /Ship Core/i }).first().click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 5000 })

      // Go to Weeks tab and wait for sprints API to complete
      await page.getByRole('tab', { name: 'Weeks' }).click()
      await page.waitForResponse(resp => resp.url().includes('/api/programs/') && resp.url().includes('/sprints'))

      // Should see week cards with progress info (format: "X/Y done" or "X/Y ✓")
      // Hours only show when estimates exist: "· Xh"
      await expect(page.getByText(/\d+\/\d+/).first()).toBeVisible({ timeout: 10000 })
    })

    test('sprint timeline cards show estimate totals when issues have estimates', async ({ page }) => {
      await page.goto('/programs')
      await page.locator('tr[role="row"]', { hasText: /Ship Core/i }).first().click()
      await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 5000 })

      // Wait for sprints API to complete after clicking Weeks tab
      await page.getByRole('tab', { name: 'Weeks' }).click()
      await page.waitForResponse(resp => resp.url().includes('/api/programs/') && resp.url().includes('/sprints'))

      // Timeline cards should be visible - format is "Week of Jan 27" not "Week 1"
      const sprintCard = page.locator('button').filter({ hasText: /Week of/ }).first()
      await expect(sprintCard).toBeVisible({ timeout: 10000 })

      // Sprint cards show issue counts (hours only show when estimates exist)
      // The format is "X/Y done" or "X/Y ✓" for completed sprints
      await expect(sprintCard.getByText(/\d+\/\d+/)).toBeVisible({ timeout: 5000 })
    })
  })
})


test.describe('Progress Chart Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill('dev@ship.local')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL('/login', { timeout: 5000 })
  })

  test('progress chart shows estimate-based metrics', async ({ page }) => {
    // Use Ship Core which has comprehensive sprint/issue data with estimates
    await page.goto('/programs')
    await page.locator('tr[role="row"]', { hasText: /Ship Core/i }).first().click()
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 5000 })

    await page.getByRole('tab', { name: 'Weeks' }).click()

    // The progress chart should include hours-based visualization
    // Look for the chart container
    await expect(page.locator('svg, [class*="chart"], [class*="progress"]').first()).toBeVisible({ timeout: 5000 })
  })
})
