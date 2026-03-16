import { test, expect } from './fixtures/isolated-env';

/**
 * E2E test for sprint accountability items flow.
 *
 * Tests sprint-related accountability types:
 * 1. weekly_plan - Sprint without plan shows action item
 * 2. week_start - Sprint not started (but should be) shows item
 * 3. week_issues - Sprint without issues shows action item
 *
 * These tests use API calls directly to avoid UI flakiness and
 * test the actual inference logic.
 */

// Helper to get CSRF token for API requests
async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`);
  expect(response.ok()).toBe(true);
  const { token } = await response.json();
  return token;
}

async function loginAsSuperAdmin(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });
}

async function getCurrentWeekContext(
  page: import('@playwright/test').Page,
  apiUrl: string
): Promise<{ userId: string; personId: string; currentWeekNumber: number }> {
  const meResponse = await page.request.get(`${apiUrl}/api/auth/me`);
  expect(meResponse.ok()).toBe(true);
  const meData = await meResponse.json();
  const userId = meData.data.user.id as string;

  const myWeekResponse = await page.request.get(`${apiUrl}/api/dashboard/my-week`);
  expect(myWeekResponse.ok()).toBe(true);
  const myWeekData = await myWeekResponse.json();

  return {
    userId,
    personId: myWeekData.person_id as string,
    currentWeekNumber: myWeekData.week.current_week_number as number,
  };
}

async function createFreshMemberSession(
  page: import('@playwright/test').Page,
  apiUrl: string
): Promise<{ userId: string; personId: string; currentWeekNumber: number }> {
  await loginAsSuperAdmin(page);

  const csrfToken = await getCsrfToken(page, apiUrl);
  const workspaceResponse = await page.request.get(`${apiUrl}/api/workspaces/current`);
  expect(workspaceResponse.ok()).toBe(true);
  const workspaceData = await workspaceResponse.json();
  const workspaceId = workspaceData.data.workspace.id as string;

  const email = `accountability-week-${Date.now()}@ship.local`;
  const inviteResponse = await page.request.post(`${apiUrl}/api/workspaces/${workspaceId}/invites`, {
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    data: { email, role: 'member' },
  });
  expect(inviteResponse.ok()).toBe(true);
  const inviteData = await inviteResponse.json();
  const token = inviteData.data.invite.token as string;

  await page.context().clearCookies();
  await page.goto(`/invite/${token}`);
  await expect(page.getByText("You're Invited!")).toBeVisible({ timeout: 10000 });
  await page.locator('#name').fill('Accountability Member');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Create Account & Accept' }).click();
  await expect(page).toHaveURL(/\/docs/, { timeout: 10000 });

  return getCurrentWeekContext(page, apiUrl);
}

test.describe('Week Accountability Flow', () => {
  test('allocated person without weekly_plan shows action item, creating plan removes it', async ({ page, apiServer }) => {
    const { userId, personId, currentWeekNumber } = await createFreshMemberSession(page, apiServer.url);
    const csrfToken = await getCsrfToken(page, apiServer.url);

    // Create program + project
    const programResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { title: 'Plan Test Program', document_type: 'program' },
    });
    expect(programResponse.ok()).toBe(true);
    const program = await programResponse.json();

    const projectResponse = await page.request.post(`${apiServer.url}/api/projects`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Plan Test Project',
        belongs_to: [{ id: program.id, type: 'program' }],
        properties: { color: '#3b82f6' },
      },
    });
    expect(projectResponse.ok()).toBe(true);
    const project = await projectResponse.json();

    // Create a sprint in the current week with the member explicitly allocated.
    // weekly_plan accountability is person+week based, so using a fresh member
    // avoids collisions with any seeded plans for the default admin user.
    const sprintResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Plan Test Sprint',
        document_type: 'sprint',
        belongs_to: [{ id: program.id, type: 'program' }, { id: project.id, type: 'project' }],
        properties: {
          sprint_number: currentWeekNumber,
          owner_id: userId,
          assignee_ids: [personId],
          project_id: project.id,
          status: 'active',
        },
      },
    });
    expect(sprintResponse.ok()).toBe(true);

    // Step 1: Check action items — should include weekly_plan (no plan document exists yet)
    const actionItemsResponse1 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse1.ok()).toBe(true);
    const actionItems1 = await actionItemsResponse1.json();

    const planItems1 = actionItems1.items.filter(
      (item: { accountability_type: string }) => item.accountability_type === 'weekly_plan'
    );
    expect(planItems1.length, 'Should have a weekly_plan action item when no plan document exists').toBeGreaterThanOrEqual(1);

    // Step 2: Create a weekly_plan document with content (the new way)
    const planResponse = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { person_id: personId, project_id: project.id, week_number: currentWeekNumber },
    });
    expect(planResponse.ok()).toBe(true);
    const plan = await planResponse.json();

    // Add content to make it count as "has content"
    await page.request.patch(`${apiServer.url}/api/documents/${plan.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        content: {
          type: 'doc',
          content: [
            { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'What I plan to accomplish this week' }] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Deliver API specification for auth module' }] }] },
            ]},
          ],
        },
      },
    });

    // Step 3: Check action items again — weekly_plan for this project/week should be gone
    const actionItemsResponse2 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse2.ok()).toBe(true);
    const actionItems2 = await actionItemsResponse2.json();

    const planItems2 = actionItems2.items.filter(
      (item: { accountability_type: string; project_id?: string | null }) =>
        item.accountability_type === 'weekly_plan' && item.project_id === project.id
    );
    expect(planItems2.length, 'After creating plan document, weekly_plan action item should be gone').toBe(0);
  });

  test('sprint not started shows action item, starting sprint removes it', async ({ page, apiServer }) => {
    await loginAsSuperAdmin(page);
    const csrfToken = await getCsrfToken(page, apiServer.url);

    const { userId, currentWeekNumber } = await getCurrentWeekContext(page, apiServer.url);

    // Create a program
    const programResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Program for Sprint Start',
        document_type: 'program',
      },
    });
    expect(programResponse.ok()).toBe(true);
    const program = await programResponse.json();
    const programId = program.id;

    // Create a sprint in the current week in planning status so it should
    // immediately require a week_start action.
    const sprintResponse = await page.request.post(`${apiServer.url}/api/weeks`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Sprint Not Started',
        program_id: programId,
        sprint_number: currentWeekNumber,
        owner_id: userId,
      },
    });
    expect(sprintResponse.ok()).toBe(true);
    const sprint = await sprintResponse.json();
    const sprintId = sprint.id;

    // Step 1: Check for week_start action item (sprint should be started but isn't)
    const actionItemsResponse1 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse1.ok()).toBe(true);
    const actionItems1 = await actionItemsResponse1.json();

    const startItems1 = actionItems1.items.filter(
      (item: { accountability_target_id: string; accountability_type: string }) =>
        item.accountability_target_id === sprintId && item.accountability_type === 'week_start'
    );

    // Should have week_start action item
    expect(startItems1.length).toBe(1);

    // Step 2: Start the sprint
    const startSprintResponse = await page.request.patch(`${apiServer.url}/api/weeks/${sprintId}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: { status: 'active' },
    });
    expect(startSprintResponse.ok()).toBe(true);

    // Step 3: Check action items again - week_start should be GONE
    const actionItemsResponse2 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse2.ok()).toBe(true);
    const actionItems2 = await actionItemsResponse2.json();

    const startItems2 = actionItems2.items.filter(
      (item: { accountability_target_id: string; accountability_type: string }) =>
        item.accountability_target_id === sprintId && item.accountability_type === 'week_start'
    );

    // After starting sprint, no week_start item should exist
    expect(startItems2.length).toBe(0);
  });

  test('sprint without issues shows action item, adding issue removes it', async ({ page, apiServer }) => {
    await loginAsSuperAdmin(page);
    const csrfToken = await getCsrfToken(page, apiServer.url);

    const { userId, currentWeekNumber } = await getCurrentWeekContext(page, apiServer.url);

    // Create a program
    const programResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Program for Sprint Issues',
        document_type: 'program',
      },
    });
    expect(programResponse.ok()).toBe(true);
    const program = await programResponse.json();
    const programId = program.id;

    // Create a sprint in the current week so the missing-issues rule is active.
    const sprintResponse = await page.request.post(`${apiServer.url}/api/weeks`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Sprint Without Issues',
        program_id: programId,
        sprint_number: currentWeekNumber,
        owner_id: userId,
      },
    });
    expect(sprintResponse.ok()).toBe(true);
    const sprint = await sprintResponse.json();
    const sprintId = sprint.id;

    // Step 1: Check for week_issues action item (no issues in sprint)
    const actionItemsResponse1 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse1.ok()).toBe(true);
    const actionItems1 = await actionItemsResponse1.json();

    const issuesItems1 = actionItems1.items.filter(
      (item: { accountability_target_id: string; accountability_type: string }) =>
        item.accountability_target_id === sprintId && item.accountability_type === 'week_issues'
    );

    // Should have week_issues action item
    expect(issuesItems1.length).toBe(1);

    // Step 2: Create an issue and associate it with the sprint via belongs_to
    const issueResponse = await page.request.post(`${apiServer.url}/api/issues`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Issue for Sprint',
        belongs_to: [{ id: sprintId, type: 'sprint' }],
      },
    });
    expect(issueResponse.ok()).toBe(true);

    // Step 3: Check action items again - week_issues should be GONE
    const actionItemsResponse2 = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse2.ok()).toBe(true);
    const actionItems2 = await actionItemsResponse2.json();

    const issuesItems2 = actionItems2.items.filter(
      (item: { accountability_target_id: string; accountability_type: string }) =>
        item.accountability_target_id === sprintId && item.accountability_type === 'week_issues'
    );

    // After adding issue, no week_issues item should exist
    expect(issuesItems2.length).toBe(0);
  });

  test('sprint in future does not show action items', async ({ page, apiServer }) => {
    await loginAsSuperAdmin(page);
    const csrfToken = await getCsrfToken(page, apiServer.url);

    const { userId } = await getCurrentWeekContext(page, apiServer.url);

    // Create a program
    const programResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Program for Future Sprint',
        document_type: 'program',
      },
    });
    expect(programResponse.ok()).toBe(true);
    const program = await programResponse.json();
    const programId = program.id;

    // Create a sprint very far in future (sprint 1000 - about 19 years from workspace start)
    const sprintResponse = await page.request.post(`${apiServer.url}/api/weeks`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Future Sprint',
        program_id: programId,
        sprint_number: 1000,
        owner_id: userId,
      },
    });
    expect(sprintResponse.ok()).toBe(true);
    const sprint = await sprintResponse.json();
    const sprintId = sprint.id;

    // Check action items - future sprint should NOT show any accountability items
    const actionItemsResponse = await page.request.get(`${apiServer.url}/api/accountability/action-items`);
    expect(actionItemsResponse.ok()).toBe(true);
    const actionItems = await actionItemsResponse.json();

    const futureSprintItems = actionItems.items.filter(
      (item: { accountability_target_id: string }) => item.accountability_target_id === sprintId
    );

    // Future sprints should not trigger accountability items
    expect(futureSprintItems.length).toBe(0);
  });
});
