import { test, expect, Page } from './fixtures/isolated-env'

async function loginAsSuperAdmin(page: Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await page.locator('#email').fill('dev@ship.local')
  await page.locator('#password').fill('admin123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).not.toHaveURL('/login', { timeout: 10000 })
}

async function getCsrfToken(page: Page): Promise<string> {
  const response = await page.request.get('/api/csrf-token')
  expect(response.ok()).toBe(true)
  const data = await response.json()
  return data.token
}

async function createWorkspace(page: Page, name: string) {
  const csrfToken = await getCsrfToken(page)
  const response = await page.request.post('/api/admin/workspaces', {
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    data: { name },
  })

  expect(response.ok()).toBe(true)
  const data = await response.json()
  return data.data.workspace as { id: string; name: string }
}

async function searchUser(page: Page, query: string, workspaceId: string) {
  const response = await page.request.get(
    `/api/admin/users/search?q=${encodeURIComponent(query)}&workspaceId=${workspaceId}`
  )
  expect(response.ok()).toBe(true)
  const data = await response.json()
  expect(data.data.users.length).toBeGreaterThan(0)
  const exactMatch = data.data.users.find((candidate: { email: string }) => candidate.email === query)
  return (exactMatch ?? data.data.users[0]) as { id: string; email: string; name: string }
}

async function getAvailableUser(page: Page, workspaceId: string) {
  return searchUser(page, 'ship.local', workspaceId)
}

async function addWorkspaceMember(page: Page, workspaceId: string, userId: string, role: 'admin' | 'member' = 'member') {
  const csrfToken = await getCsrfToken(page)
  const response = await page.request.post(`/api/admin/workspaces/${workspaceId}/members`, {
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    data: { userId, role },
  })

  expect(response.ok()).toBe(true)
  return response.json()
}

async function createWorkspaceAndOpen(page: Page, options?: { name?: string }) {
  const workspaceName = options?.name ?? `Admin Workspace ${Date.now()}`
  const workspace = await createWorkspace(page, workspaceName)

  await page.goto('/admin')
  const workspaceLink = page.getByRole('link', { name: new RegExp(`^${workspace.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
  await expect(workspaceLink).toBeVisible({ timeout: 10000 })
  await workspaceLink.click()
  await expect(page).toHaveURL(new RegExp(`/admin/workspaces/${workspace.id}$`))

  return workspace
}

async function createWorkspaceWithMember(page: Page) {
  const workspace = await createWorkspace(page, `Admin Member Workspace ${Date.now()}`)
  const user = await getAvailableUser(page, workspace.id)
  await addWorkspaceMember(page, workspace.id, user.id)
  await page.goto(`/admin/workspaces/${workspace.id}`)
  await expect(page.getByRole('heading', { name: new RegExp(`Workspace:\\s*${workspace.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })).toBeVisible()

  return { workspace, user }
}

test.describe('Admin Workspace Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('can navigate to workspace detail by clicking workspace name', async ({ page }) => {
    const workspace = await createWorkspaceAndOpen(page)

    await expect(
      page.getByRole('heading', { name: new RegExp(`Workspace:\\s*${workspace.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
    ).toBeVisible()
  })

  test('workspace detail page shows members table', async ({ page }) => {
    const { user } = await createWorkspaceWithMember(page)

    await expect(page.getByRole('heading', { name: /Members \(\d+\)/ })).toBeVisible()
    await expect(page.getByText(user.email)).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1)
  })

  test('workspace detail page shows pending invites section', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    await expect(page.getByRole('heading', { name: /Pending Invites/ })).toBeVisible()
  })

  test('workspace detail page shows add existing user section', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    await expect(page.getByRole('heading', { name: 'Add Existing User' })).toBeVisible()
    await expect(page.getByPlaceholder('Search by email...')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add User' })).toBeVisible()
  })

  test('workspace detail page shows invite form', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    await expect(page.getByRole('heading', { name: 'Invite New Member' })).toBeVisible()
    await expect(page.getByPlaceholder('email@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send Invite' })).toBeVisible()
  })

  test('back button returns to admin dashboard', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click()
    await expect(page).toHaveURL('/admin')
  })
})

test.describe('Admin Workspace Member Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('can change member role', async ({ page }) => {
    const { user } = await createWorkspaceWithMember(page)

    const memberRow = page.locator('tr').filter({ hasText: user.email }).first()
    await expect(memberRow).toBeVisible({ timeout: 10000 })
    const roleSelect = memberRow.locator('select')
    await expect(roleSelect).toBeVisible()
    await expect(roleSelect).toHaveValue('member')

    await roleSelect.selectOption('admin')
    await expect(roleSelect).toHaveValue('admin')
  })

  test('can send invite to new email', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    const testEmail = `test-admin-${Date.now()}@example.com`
    await page.getByPlaceholder('email@example.com').fill(testEmail)
    await page.getByRole('button', { name: 'Send Invite' }).click()

    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 5000 })
  })

  test('can revoke invite', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    const testEmail = `test-revoke-${Date.now()}@example.com`
    await page.getByPlaceholder('email@example.com').fill(testEmail)
    await page.getByRole('button', { name: 'Send Invite' }).click()
    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 5000 })

    const inviteRow = page.locator('tr').filter({ hasText: testEmail })
    await inviteRow.getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByText(testEmail)).not.toBeVisible({ timeout: 5000 })
  })

  test('can copy invite link', async ({ page }) => {
    await createWorkspaceAndOpen(page)

    const testEmail = `test-copy-${Date.now()}@example.com`
    await page.getByPlaceholder('email@example.com').fill(testEmail)
    await page.getByRole('button', { name: 'Send Invite' }).click()
    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 5000 })

    const inviteRow = page.locator('tr').filter({ hasText: testEmail })
    await inviteRow.getByRole('button', { name: 'Copy Link' }).click()
    await expect(inviteRow.getByRole('button', { name: /Copied!/ })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Admin User Search', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page)
  })

  test('user search shows results when typing', async ({ page }) => {
    const workspace = await createWorkspaceAndOpen(page)
    const user = await getAvailableUser(page, workspace.id)

    await page.getByPlaceholder('Search by email...').fill(user.email)
    await page.waitForTimeout(500)

    await expect(page.locator('button').filter({ hasText: user.email }).first()).toBeVisible({ timeout: 5000 })
  })

  test('selecting user from search enables Add User button', async ({ page }) => {
    const workspace = await createWorkspaceAndOpen(page)
    const user = await getAvailableUser(page, workspace.id)

    await page.getByPlaceholder('Search by email...').fill(user.email)
    await page.waitForTimeout(500)

    const userResult = page.locator('button').filter({ hasText: user.email }).first()
    await expect(userResult).toBeVisible({ timeout: 10000 })
    await userResult.click()

    const addButton = page.getByRole('button', { name: 'Add User' })
    await expect(addButton).not.toBeDisabled()
  })

  test('can add existing user to workspace', async ({ page }) => {
    const workspace = await createWorkspaceAndOpen(page)
    const user = await getAvailableUser(page, workspace.id)

    const memberHeading = page.getByRole('heading', { name: /Members \((\d+)\)/ })
    await expect(memberHeading).toContainText('(0)')

    await page.getByPlaceholder('Search by email...').fill(user.email)
    await page.waitForTimeout(500)

    const userResult = page.locator('button').filter({ hasText: user.email }).first()
    await expect(userResult).toBeVisible({ timeout: 10000 })
    await userResult.click()
    await page.getByRole('button', { name: 'Add User' }).click()

    await expect(page.getByRole('heading', { name: /Members \((\d+)\)/ })).toContainText('(1)', { timeout: 5000 })
    await expect(page.getByText(user.email)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Admin Workspace Access Control', () => {
  test('non-super-admin cannot access workspace detail', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/admin/workspaces/some-id')
    await expect(page).toHaveURL(/\/login/)
  })
})
