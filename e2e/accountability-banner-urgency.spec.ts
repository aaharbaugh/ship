import { test, expect } from './fixtures/isolated-env';

/**
 * E2E tests for accountability banner urgency colors.
 *
 * Tests that the banner shows:
 * - red (bg-red-600) when any overdue items exist
 * - response includes has_overdue and has_due_today flags
 * - clicking the banner opens the ActionItemsModal
 * - days_overdue values are correctly computed
 */

// Helper to login and get auth context
async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });
}

async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`);
  expect(response.ok()).toBe(true);
  const { token } = await response.json();
  return token;
}

async function getActionItems(page: import('@playwright/test').Page, apiUrl: string) {
  const response = await page.request.get(`${apiUrl}/api/accountability/action-items`);
  expect(response.ok()).toBe(true);
  return response.json();
}

test.describe('Accountability Banner Urgency', () => {
  test('API response includes has_overdue and has_due_today flags', async ({ page, apiServer }) => {
    await login(page);

    const data = await getActionItems(page, apiServer.url);

    // Verify the response shape includes urgency flags
    expect(data).toHaveProperty('has_overdue');
    expect(data).toHaveProperty('has_due_today');
    expect(typeof data.has_overdue).toBe('boolean');
    expect(typeof data.has_due_today).toBe('boolean');
  });

  test('banner urgency matches the action-items flags', async ({ page, apiServer }) => {
    await login(page);

    const actionItems = await getActionItems(page, apiServer.url);
    expect(actionItems.total).toBeGreaterThan(0);

    // Navigate to app - banner should render with red background
    await page.goto('/');
    await expect(page).not.toHaveURL('/login', { timeout: 5000 });

    const banner = page.locator('button.bg-red-600, button.bg-amber-700');
    await expect(banner).toBeVisible({ timeout: 10000 });

    if (actionItems.has_overdue) {
      await expect(page.locator('button.bg-red-600')).toBeVisible();
      await expect(banner.locator('.bg-red-800')).toBeVisible();
    } else {
      expect(actionItems.has_due_today).toBe(true);
      await expect(page.locator('button.bg-amber-700')).toBeVisible();
    }
  });

  test('urgency flags correctly reflect item days_overdue values', async ({ page, apiServer }) => {
    await login(page);

    const data = await getActionItems(page, apiServer.url);
    expect(data.total).toBeGreaterThan(0);

    const overdueItems = data.items.filter((item: { days_overdue: number }) => item.days_overdue > 0);
    const dueTodayItems = data.items.filter((item: { days_overdue: number }) => item.days_overdue === 0);

    // Verify has_overdue flag matches actual items
    expect(data.has_overdue).toBe(overdueItems.length > 0);
    // Verify has_due_today flag matches actual items
    expect(data.has_due_today).toBe(dueTodayItems.length > 0);
  });

  test('clicking banner opens the action items modal', async ({ page, apiServer }) => {
    await login(page);

    const actionItems = await getActionItems(page, apiServer.url);
    expect(actionItems.total).toBeGreaterThan(0);

    // Navigate to app
    await page.goto('/');
    await expect(page).not.toHaveURL('/login', { timeout: 5000 });

    // Wait for the accountability banner to appear
    // The fixture disables auto-open modal, so banner should be clickable
    const banner = page.locator('button.bg-red-600, button.bg-amber-700');
    await expect(banner).toBeVisible({ timeout: 10000 });

    // Click the banner to open the modal
    await banner.click();

    // Modal should open - look for the dialog
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });
});
