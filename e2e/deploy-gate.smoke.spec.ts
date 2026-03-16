import { test, expect, type Page } from './fixtures/isolated-env'

test.describe('Deploy Gate Smoke', () => {
  async function login(page: Page, email = 'dev@ship.local', password = 'admin123') {
    await page.context().clearCookies()
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible({ timeout: 15000 })
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 })
  }

  async function getCsrfToken(page: Page): Promise<string> {
    const response = await page.request.get('/api/csrf-token')
    expect(response.ok()).toBe(true)
    const data = await response.json()
    return data.token
  }

  async function createWikiDocument(
    page: Page,
    options: { title: string; visibility?: 'private' | 'workspace'; parent_id?: string | null }
  ) {
    const csrfToken = await getCsrfToken(page)
    const response = await page.request.post('/api/documents', {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      data: {
        title: options.title,
        document_type: 'wiki',
        visibility: options.visibility,
        parent_id: options.parent_id ?? null,
      },
    })

    expect(response.ok()).toBe(true)
    return response.json()
  }

  async function createDocument(
    page: Page,
    options: {
      title: string
      document_type: 'wiki' | 'issue' | 'program' | 'project' | 'sprint'
      visibility?: 'private' | 'workspace'
      parent_id?: string | null
      properties?: Record<string, unknown>
    }
  ) {
    const csrfToken = await getCsrfToken(page)
    const response = await page.request.post('/api/documents', {
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
      data: {
        title: options.title,
        document_type: options.document_type,
        visibility: options.visibility,
        parent_id: options.parent_id ?? null,
        properties: options.properties,
      },
    })

    expect(response.ok()).toBe(true)
    return response.json()
  }

  async function getCurrentUser(page: Page) {
    const response = await page.request.get('/api/auth/me')
    expect(response.ok()).toBe(true)
    const data = await response.json()
    return data.data.user
  }

  async function createActionableSprintItem(page: Page) {
    const user = await getCurrentUser(page)
    return createDocument(page, {
      title: `Deploy Gate Week ${Date.now()}`,
      document_type: 'sprint',
      properties: {
        sprint_number: 1,
        owner_id: user.id,
        status: 'planning',
        assignee_ids: [user.id],
      },
    })
  }

  async function clearQueryCache(page: Page) {
    await page.evaluate(async () => {
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name === 'ship-query-cache') {
          indexedDB.deleteDatabase(db.name)
        }
      }
    })
  }

  test('auth smoke: user can sign in and see the app shell', async ({ page }) => {
    await login(page)

    await expect(page.getByLabel('Primary navigation')).toBeVisible({ timeout: 10000 })
    await expect(page.getByLabel('Document list')).toBeVisible()
    await expect(page).toHaveURL(/\/(docs|documents\/)/)
  })

  test('docs smoke: user can create and reopen a document', async ({ page }) => {
    await login(page)
    await page.goto('/docs')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'New Document', exact: true }).click()
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 15000 })

    const title = `Deploy Gate Doc ${Date.now()}`
    const titleInput = page.getByPlaceholder('Untitled')
    await expect(titleInput).toBeVisible({ timeout: 10000 })
    await titleInput.fill(title)
    await page.waitForTimeout(1000)

    const documentUrl = page.url()
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(documentUrl)
    await expect(page.getByPlaceholder('Untitled')).toHaveValue(title, { timeout: 10000 })
    await expect(page.locator('.ProseMirror')).toBeVisible()
  })

  test('issues smoke: user can create an issue and see issue controls', async ({ page }) => {
    await login(page)
    await page.goto('/issues')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: 'New Issue', exact: true }).click()
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 15000 })

    const title = `Deploy Gate Issue ${Date.now()}`
    await page.getByPlaceholder('Untitled').fill(title)
    await page.waitForTimeout(1000)

    await expect(page.getByRole('button', { name: /Promote to Project/i })).toBeVisible({ timeout: 10000 })
    await expect(page.getByLabel('Document properties')).toBeVisible()
    await expect(page.getByText(/Add program\.\.\./)).toBeVisible()
    await expect(page.getByPlaceholder('Untitled')).toHaveValue(title)
  })

  test('programs smoke: seeded program detail opens successfully', async ({ page }) => {
    await login(page)
    const title = `Deploy Gate Program ${Date.now()}`
    await createDocument(page, { title, document_type: 'program' })
    await page.goto('/programs')
    await page.waitForLoadState('networkidle')
    await clearQueryCache(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    const programRow = page.locator('table tbody tr').filter({ hasText: title }).first()
    await expect(programRow).toBeVisible({ timeout: 10000 })
    await programRow.click()

    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 15000 })
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Projects' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Weeks' })).toBeVisible()
  })

  test('projects smoke: seeded project detail opens successfully', async ({ page }) => {
    await login(page)
    const title = `Deploy Gate Project ${Date.now()}`
    await createDocument(page, { title, document_type: 'project' })
    await page.goto('/projects')
    await page.waitForLoadState('networkidle')
    await clearQueryCache(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    const projectRow = page.locator('table tbody tr').filter({ hasText: title }).first()
    await expect(projectRow).toBeVisible({ timeout: 10000 })
    await projectRow.click()

    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 15000 })
    const projectSidebar = page.getByLabel('Document list')
    await expect(projectSidebar.getByRole('link', { name: 'Details' })).toBeVisible()
    await expect(projectSidebar.getByRole('link', { name: 'Issues' })).toBeVisible()
    await expect(projectSidebar.getByRole('link', { name: 'Weeks' })).toBeVisible()
  })

  test('private-docs smoke: creator can see private doc and unauthenticated access is blocked', async ({ page, apiServer }) => {
    await login(page)

    const title = `Deploy Gate Private ${Date.now()}`
    const privateDoc = await createWikiDocument(page, { title, visibility: 'private' })

    await page.goto('/docs')
    await clearQueryCache(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    const sidebar = page.getByLabel('Document list')
    await expect(sidebar.getByRole('link', { name: title })).toBeVisible({ timeout: 10000 })

    const response = await fetch(`${apiServer.url}/api/documents/${privateDoc.id}`)
    expect(response.status).toBe(401)
  })

  test('accountability smoke: banner renders and modal opens when action items exist', async ({ page }) => {
    await login(page)
    await createActionableSprintItem(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const banner = page.locator('button.bg-red-600, button.bg-amber-700')
    await expect(banner).toBeVisible({ timeout: 10000 })
    await banner.click()

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  })

  test('collaboration smoke: edits sync across two pages for the same document', async ({ page }) => {
    await login(page)

    const doc = await createWikiDocument(page, { title: `Realtime Doc ${Date.now()}` })
    const documentUrl = `/documents/${doc.id}`
    const collaboratorPage = await page.context().newPage()

    await collaboratorPage.goto(documentUrl)
    await expect(collaboratorPage.locator('.ProseMirror')).toBeVisible({ timeout: 10000 })

    await page.goto(documentUrl)
    const editor = page.locator('.ProseMirror')
    const collaboratorEditor = collaboratorPage.locator('.ProseMirror')

    await expect(editor).toBeVisible({ timeout: 10000 })
    await editor.click()

    const text = `Realtime smoke ${Date.now()}`
    await page.keyboard.type(text)

    await expect(collaboratorEditor).toContainText(text, { timeout: 10000 })
    await collaboratorPage.close()
  })
})
