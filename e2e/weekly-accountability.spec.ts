import { test, expect } from './fixtures/isolated-env';

/**
 * E2E tests for Weekly Accountability Documents feature.
 *
 * Tests the per-person weekly plan and retro document system:
 * 1. API endpoints for creating/querying weekly plans and retros
 * 2. Idempotent document creation (same inputs return same document)
 * 3. Project allocation grid API for the Weeks tab
 * 4. Content version history for accountability auditing
 *
 * These tests use API calls directly to test the inference logic
 * without UI flakiness.
 */

// Helper to get CSRF token for API requests
async function getCsrfToken(page: import('@playwright/test').Page, apiUrl: string): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/csrf-token`);
  expect(response.ok()).toBe(true);
  const { token } = await response.json();
  return token;
}

// Helper to login and get user context
async function loginAndGetContext(page: import('@playwright/test').Page, apiUrl: string) {
  await page.goto('/login');
  await page.locator('#email').fill('dev@ship.local');
  await page.locator('#password').fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL('/login', { timeout: 5000 });

  const csrfToken = await getCsrfToken(page, apiUrl);

  const meResponse = await page.request.get(`${apiUrl}/api/auth/me`);
  expect(meResponse.ok()).toBe(true);
  const meData = await meResponse.json();
  const userId = meData.data.user.id;

  return { csrfToken, userId };
}

// Helper to get person document ID for the current user
async function getPersonIdForUser(
  page: import('@playwright/test').Page,
  apiUrl: string,
  userId: string
): Promise<string> {
  const response = await page.request.get(`${apiUrl}/api/documents?document_type=person`);
  expect(response.ok()).toBe(true);
  const docs = await response.json();
  const person = docs.find(
    (d: { properties?: { user_id?: string } }) => d.properties?.user_id === userId
  );
  expect(person, 'User should have an associated person document').toBeTruthy();
  return person.id;
}

// Helper to create a project for testing
async function createTestProject(
  page: import('@playwright/test').Page,
  apiUrl: string,
  csrfToken: string,
  title: string
): Promise<string> {
  const response = await page.request.post(`${apiUrl}/api/documents`, {
    headers: { 'x-csrf-token': csrfToken },
    data: {
      title,
      document_type: 'project',
    },
  });
  expect(response.ok()).toBe(true);
  const project = await response.json();
  return project.id;
}

async function getCurrentSprintNumber(
  page: import('@playwright/test').Page,
  apiUrl: string,
  projectId: string
): Promise<number> {
  const response = await page.request.get(
    `${apiUrl}/api/weekly-plans/project-allocation-grid/${projectId}`
  );
  expect(response.ok()).toBe(true);
  const grid = await response.json();
  expect(grid.currentSprintNumber).toBeGreaterThanOrEqual(1);
  return grid.currentSprintNumber;
}

async function getNextUnusedWeekNumber(
  page: import('@playwright/test').Page,
  apiUrl: string,
  personId: string,
  kind: 'plan' | 'retro'
): Promise<number> {
  const basePath = kind === 'plan' ? 'weekly-plans' : 'weekly-retros'
  const response = await page.request.get(`${apiUrl}/api/${basePath}?person_id=${personId}`)
  expect(response.ok()).toBe(true)
  const docs = await response.json()
  const maxWeekNumber = docs.reduce((max: number, doc: { properties?: { week_number?: number } }) => {
    const weekNumber = doc.properties?.week_number ?? 0
    return Math.max(max, weekNumber)
  }, 0)
  return maxWeekNumber + 1
}

test.describe('Weekly Plan API', () => {
  test('POST /weekly-plans creates new weekly plan document', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project for Weekly Plan');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')

    // Create weekly plan
    const response = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });

    expect(response.status()).toBe(201);
    const plan = await response.json();

    expect(plan.id).toBeTruthy();
    expect(plan.document_type).toBe('weekly_plan');
    // API returns computed title with person name (e.g., "Week 1 Plan - Dev User")
    expect(plan.title).toMatch(/^Week \d+ Plan/)
    expect(plan.properties.person_id).toBe(personId);
    expect(plan.properties.project_id).toBe(projectId);
    expect(plan.properties.week_number).toBe(weekNumber);
    expect(plan.properties.submitted_at).toBeNull();
  });

  test('POST /weekly-plans is idempotent - returns existing document', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Idempotent');

    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')
    const planData = {
      person_id: personId,
      project_id: projectId,
      week_number: weekNumber,
    };

    // First creation - should return 201
    const response1 = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: planData,
    });
    expect(response1.status()).toBe(201);
    const plan1 = await response1.json();

    // Second creation with same inputs - should return 200 with same ID
    const response2 = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: planData,
    });
    expect(response2.status()).toBe(200);
    const plan2 = await response2.json();

    // Same document should be returned
    expect(plan2.id).toBe(plan1.id);
    expect(plan2.properties.week_number).toBe(weekNumber);
  });

  test('GET /weekly-plans queries plans by person and project', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Query');
    const firstWeekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')
    const weekNumbers = [firstWeekNumber, firstWeekNumber + 1, firstWeekNumber + 2]

    // Create a few plans
    for (const weekNum of weekNumbers) {
      await page.request.post(`${apiServer.url}/api/weekly-plans`, {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          person_id: personId,
          project_id: projectId,
          week_number: weekNum,
        },
      });
    }

    // Query by person_id and project_id
    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans?person_id=${personId}&project_id=${projectId}`
    );
    expect(response.ok()).toBe(true);
    const plans = await response.json();

    expect(plans.length).toBeGreaterThanOrEqual(3);
    for (const plan of plans) {
      expect(plan.document_type).toBe('weekly_plan');
      expect(plan.properties.person_id).toBe(personId);
      expect(plan.properties.project_id).toBe(projectId);
    }
  });

  test('GET /weekly-plans/:id returns specific plan', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Get By ID');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')

    // Create a plan
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const created = await createResponse.json();

    // Get by ID
    const getResponse = await page.request.get(`${apiServer.url}/api/weekly-plans/${created.id}`);
    expect(getResponse.ok()).toBe(true);
    const plan = await getResponse.json();

    expect(plan.id).toBe(created.id);
    expect(plan.properties.week_number).toBe(weekNumber);
  });

  test('POST /weekly-plans returns 404 for non-existent person', async ({ page, apiServer }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project 404 Person');

    const response = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: '00000000-0000-0000-0000-000000000000',
        project_id: projectId,
        week_number: 1,
      },
    });

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Person not found');
  });

  test('POST /weekly-plans returns 404 for non-existent project', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);

    const response = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: '00000000-0000-0000-0000-000000000000',
        week_number: 1,
      },
    });

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Project not found');
  });
});

test.describe('Weekly Retro API', () => {
  test('POST /weekly-retros creates new weekly retro document', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project for Weekly Retro');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')

    // Create weekly retro
    const response = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });

    expect(response.status()).toBe(201);
    const retro = await response.json();

    expect(retro.id).toBeTruthy();
    expect(retro.document_type).toBe('weekly_retro');
    // API returns computed title with person name (e.g., "Week 1 Retro - Dev User")
    expect(retro.title).toMatch(/^Week \d+ Retro/)
    expect(retro.properties.person_id).toBe(personId);
    expect(retro.properties.project_id).toBe(projectId);
    expect(retro.properties.week_number).toBe(weekNumber);
    expect(retro.properties.submitted_at).toBeNull();
  });

  test('POST /weekly-retros is idempotent - returns existing document', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Retro Idempotent');

    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')
    const retroData = {
      person_id: personId,
      project_id: projectId,
      week_number: weekNumber,
    };

    // First creation - should return 201
    const response1 = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: retroData,
    });
    expect(response1.status()).toBe(201);
    const retro1 = await response1.json();

    // Second creation with same inputs - should return 200 with same ID
    const response2 = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: retroData,
    });
    expect(response2.status()).toBe(200);
    const retro2 = await response2.json();

    // Same document should be returned
    expect(retro2.id).toBe(retro1.id);
    expect(retro2.properties.week_number).toBe(weekNumber);
  });

  test('GET /weekly-retros queries retros by person and project', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Retro Query');
    const firstWeekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')
    const weekNumbers = [firstWeekNumber, firstWeekNumber + 1, firstWeekNumber + 2]

    // Create a few retros
    for (const weekNum of weekNumbers) {
      await page.request.post(`${apiServer.url}/api/weekly-retros`, {
        headers: { 'x-csrf-token': csrfToken },
        data: {
          person_id: personId,
          project_id: projectId,
          week_number: weekNum,
        },
      });
    }

    // Query by person_id and project_id
    const response = await page.request.get(
      `${apiServer.url}/api/weekly-retros?person_id=${personId}&project_id=${projectId}`
    );
    expect(response.ok()).toBe(true);
    const retros = await response.json();

    expect(retros.length).toBeGreaterThanOrEqual(3);
    for (const retro of retros) {
      expect(retro.document_type).toBe('weekly_retro');
      expect(retro.properties.person_id).toBe(personId);
      expect(retro.properties.project_id).toBe(projectId);
    }
  });

  test('GET /weekly-retros/:id returns specific retro', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Retro Get By ID');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')

    // Create a retro
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const created = await createResponse.json();

    // Get by ID
    const getResponse = await page.request.get(`${apiServer.url}/api/weekly-retros/${created.id}`);
    expect(getResponse.ok()).toBe(true);
    const retro = await getResponse.json();

    expect(retro.id).toBe(created.id);
    expect(retro.properties.week_number).toBe(weekNumber);
  });
});

test.describe('Project Allocation Grid API', () => {
  test('GET /project-allocation-grid/:projectId returns grid data structure', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken } = await loginAndGetContext(page, apiServer.url);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Grid');

    // Get allocation grid
    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );

    expect(response.ok(), `Expected 200 OK but got ${response.status()}`).toBe(true);
    const grid = await response.json();

    // Verify structure
    expect(grid.projectId).toBe(projectId);
    expect(grid.projectTitle).toBe('Test Project Grid');
    expect(grid.currentSprintNumber).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(grid.weeks)).toBe(true);
    expect(Array.isArray(grid.people)).toBe(true);

    // Weeks have correct structure
    for (const week of grid.weeks) {
      expect(week.number).toBeGreaterThanOrEqual(1);
      expect(week.name).toContain('Week');
      expect(week.startDate).toBeTruthy();
      expect(week.endDate).toBeTruthy();
      expect(typeof week.isCurrent).toBe('boolean');
    }
  });

  test('Allocation grid shows person with assigned issues and plan/retro status', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Allocation');
    const currentSprintNumber = await getCurrentSprintNumber(page, apiServer.url, projectId);
    const allocatedWeekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')

    // Create a program for the sprint
    const programResponse = await page.request.post(`${apiServer.url}/api/documents`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Program for Allocation',
        document_type: 'program',
      },
    });
    const program = await programResponse.json();

    // Create a sprint for the current week
    const sprintResponse = await page.request.post(`${apiServer.url}/api/weeks`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Sprint',
        program_id: program.id,
        sprint_number: allocatedWeekNumber,
        owner_id: userId,
      },
    });
    const sprint = await sprintResponse.json();

    // Set sprint properties for project assignment and person allocation
    // The allocation grid API queries properties.project_id and properties.assignee_ids
    await page.request.patch(`${apiServer.url}/api/documents/${sprint.id}`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        properties: {
          project_id: projectId,
          assignee_ids: [personId],
          sprint_number: allocatedWeekNumber,
        },
      },
    });

    // Create an issue assigned to the person (not user), in the sprint
    // Note: assignee_id must be the person document ID, not the user ID
    await page.request.post(`${apiServer.url}/api/issues`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        title: 'Test Issue for Allocation',
        assignee_id: personId,
        estimate: 4, // Required when assigning to sprint
        belongs_to: [
          { id: sprint.id, type: 'sprint' },
          { id: program.id, type: 'program' },
        ],
      },
    });

    // Create a weekly plan for the person on this project
    const planResponse = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: allocatedWeekNumber,
      },
    });
    const plan = await planResponse.json();

    // Get allocation grid
    const gridResponse = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/${projectId}`
    );

    expect(gridResponse.ok(), `Expected 200 OK but got ${gridResponse.status()}`).toBe(true);
    const grid = await gridResponse.json();

    // Find person in grid
    const personInGrid = grid.people.find((p: { id: string }) => p.id === personId);
    expect(personInGrid, 'Person should appear in allocation grid').toBeTruthy();

    expect(allocatedWeekNumber).toBeGreaterThanOrEqual(currentSprintNumber)
    const allocatedWeekData = personInGrid.weeks[allocatedWeekNumber];
    expect(allocatedWeekData, `Person should have week ${allocatedWeekNumber} data`).toBeTruthy();
    expect(allocatedWeekData.isAllocated).toBe(true);
    expect(allocatedWeekData.planId).toBe(plan.id);
  });

  test('Allocation grid returns 404 for non-existent project', async ({ page, apiServer }) => {
    await loginAndGetContext(page, apiServer.url);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/project-allocation-grid/00000000-0000-0000-0000-000000000000`
    );

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Project not found');
  });
});

test.describe('Content Version History API', () => {
  test('GET /weekly-plans/:id/history returns empty array for new document', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project History Empty');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')

    // Create weekly plan
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const plan = await createResponse.json();

    // Get history - should be empty for new document
    const historyResponse = await page.request.get(
      `${apiServer.url}/api/weekly-plans/${plan.id}/history`
    );
    expect(historyResponse.ok()).toBe(true);
    const history = await historyResponse.json();

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  test('GET /weekly-retros/:id/history returns empty array for new document', async ({
    page,
    apiServer,
  }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Retro History');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')

    // Create weekly retro
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const retro = await createResponse.json();

    // Get history - should be empty for new document
    const historyResponse = await page.request.get(
      `${apiServer.url}/api/weekly-retros/${retro.id}/history`
    );
    expect(historyResponse.ok()).toBe(true);
    const history = await historyResponse.json();

    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(0);
  });

  test('GET /weekly-plans/:id/history returns 404 for non-existent plan', async ({
    page,
    apiServer,
  }) => {
    await loginAndGetContext(page, apiServer.url);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-plans/00000000-0000-0000-0000-000000000000/history`
    );

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Weekly plan not found');
  });

  test('GET /weekly-retros/:id/history returns 404 for non-existent retro', async ({
    page,
    apiServer,
  }) => {
    await loginAndGetContext(page, apiServer.url);

    const response = await page.request.get(
      `${apiServer.url}/api/weekly-retros/00000000-0000-0000-0000-000000000000/history`
    );

    expect(response.status()).toBe(404);
    const error = await response.json();
    expect(error.error).toBe('Weekly retro not found');
  });
});

test.describe('Weekly Plan/Retro Document Navigation', () => {
  test('Weekly plan document can be fetched and navigated to', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Navigation');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'plan')

    // Create weekly plan
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-plans`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const plan = await createResponse.json();

    // Navigate to the document
    await page.goto(`/documents/${plan.id}`);

    // Verify we're on the document page (not redirected to login)
    await expect(page).not.toHaveURL('/login', { timeout: 5000 });

    // The URL should contain the document ID
    expect(page.url()).toContain(`/documents/${plan.id}`);
  });

  test('Weekly retro document can be fetched and navigated to', async ({ page, apiServer }) => {
    const { csrfToken, userId } = await loginAndGetContext(page, apiServer.url);
    const personId = await getPersonIdForUser(page, apiServer.url, userId);
    const projectId = await createTestProject(page, apiServer.url, csrfToken, 'Test Project Retro Nav');
    const weekNumber = await getNextUnusedWeekNumber(page, apiServer.url, personId, 'retro')

    // Create weekly retro
    const createResponse = await page.request.post(`${apiServer.url}/api/weekly-retros`, {
      headers: { 'x-csrf-token': csrfToken },
      data: {
        person_id: personId,
        project_id: projectId,
        week_number: weekNumber,
      },
    });
    const retro = await createResponse.json();

    // Navigate to the document
    await page.goto(`/documents/${retro.id}`);

    // Verify we're on the document page (not redirected to login)
    await expect(page).not.toHaveURL('/login', { timeout: 5000 });

    // The URL should contain the document ID
    expect(page.url()).toContain(`/documents/${retro.id}`);
  });
});
