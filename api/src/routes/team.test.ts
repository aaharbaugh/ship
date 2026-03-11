import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('Team API', () => {
  const app = createApp();
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmailBase = `team-test-${testRunId}`;
  const testWorkspaceName = `Team Test ${testRunId}`;
  const todayUtc = new Date().toISOString().split('T')[0] || '2026-03-11';
  const currentSprintNumber = 1;

  let workspaceId: string;
  let adminUserId: string;
  let memberUserId: string;
  let adminCookie: string;
  let memberCookie: string;
  let programId: string;
  let projectId: string;
  let sprintId: string;
  let workerPersonId: string;
  let inferredPersonId: string;

  async function createSession(userId: string): Promise<string> {
    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, userId, workspaceId]
    );
    return `session_id=${sessionId}`;
  }

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name, sprint_start_date) VALUES ($1, $2) RETURNING id`,
      [testWorkspaceName, todayUtc]
    );
    workspaceId = workspaceResult.rows[0].id;

    const adminResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Team Admin') RETURNING id`,
      [`${testEmailBase}-admin@ship.local`]
    );
    adminUserId = adminResult.rows[0].id;

    const memberResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Team Member') RETURNING id`,
      [`${testEmailBase}-member@ship.local`]
    );
    memberUserId = memberResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin'), ($1, $3, 'member')`,
      [workspaceId, adminUserId, memberUserId]
    );

    adminCookie = await createSession(adminUserId);
    memberCookie = await createSession(memberUserId);

    const programResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'program', 'Platform', 'workspace', $2, $3)
       RETURNING id`,
      [workspaceId, adminUserId, JSON.stringify({ color: '#0f766e' })]
    );
    programId = programResult.rows[0].id;

    const projectResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'project', 'Project Atlas', 'workspace', $2, $3)
       RETURNING id`,
      [workspaceId, adminUserId, JSON.stringify({ color: '#1d4ed8' })]
    );
    projectId = projectResult.rows[0].id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'program')`,
      [projectId, programId]
    );

    const workerPersonResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'person', 'Taylor Explicit', 'workspace', $2, $3)
       RETURNING id`,
      [workspaceId, memberUserId, JSON.stringify({ user_id: memberUserId })]
    );
    workerPersonId = workerPersonResult.rows[0].id;

    const inferredPersonResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'person', 'Jordan Inferred', 'workspace', $2, $3)
       RETURNING id`,
      [workspaceId, adminUserId, JSON.stringify({})]
    );
    inferredPersonId = inferredPersonResult.rows[0].id;

    const sprintResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'sprint', 'Week 1', 'workspace', $2, $3)
       RETURNING id`,
      [
        workspaceId,
        adminUserId,
        JSON.stringify({
          sprint_number: currentSprintNumber,
          project_id: projectId,
          assignee_ids: [workerPersonId],
          plan_approval: { state: 'approved' },
          review_approval: { state: 'approved' },
        }),
      ]
    );
    sprintId = sprintResult.rows[0].id;

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, content, properties)
       VALUES ($1, 'weekly_plan', 'Week 1 Plan', 'workspace', $2, $3, $4),
              ($1, 'weekly_retro', 'Week 1 Retro', 'workspace', $2, $5, $4)`,
      [
        workspaceId,
        adminUserId,
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship the dashboard improvements.' }] }],
        }),
        JSON.stringify({ person_id: workerPersonId, project_id: projectId, week_number: currentSprintNumber }),
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Delivered the dashboard improvements.' }] }],
        }),
      ]
    );

    const issueResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Inferred ownership issue', 'workspace', $2, $3)
       RETURNING id`,
      [
        workspaceId,
        adminUserId,
        JSON.stringify({
          assignee_id: inferredPersonId,
          state: 'in_progress',
        }),
      ]
    );
    const issueId = issueResult.rows[0].id;

    await pool.query(
      `INSERT INTO document_associations (document_id, related_id, relationship_type)
       VALUES ($1, $2, 'sprint'),
              ($1, $3, 'project')`,
      [issueId, sprintId, projectId]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM document_associations WHERE document_id IN (SELECT id FROM documents WHERE workspace_id = $1)', [workspaceId]);
    await pool.query('DELETE FROM document_associations WHERE related_id IN (SELECT id FROM documents WHERE workspace_id = $1)', [workspaceId]);
    await pool.query('DELETE FROM sessions WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [adminUserId, memberUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  describe('GET /api/team/accountability-grid-v3', () => {
    it('rejects non-admin workspace members', async () => {
      const res = await request(app)
        .get('/api/team/accountability-grid-v3')
        .set('Cookie', memberCookie);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Admin access required');
    });

    it('returns explicit assignments with completed plan and retro status', async () => {
      const res = await request(app)
        .get('/api/team/accountability-grid-v3')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.currentSprintNumber).toBe(currentSprintNumber);
      expect(res.body.weeks).toHaveLength(3);

      const platformGroup = res.body.programs.find((program: { id: string }) => program.id === programId);
      expect(platformGroup).toBeDefined();

      const explicitPerson = platformGroup.people.find((person: { id: string }) => person.id === workerPersonId);
      expect(explicitPerson).toBeDefined();
      expect(explicitPerson.weeks[currentSprintNumber].projectId).toBe(projectId);
      expect(explicitPerson.weeks[currentSprintNumber].projectName).toBe('Project Atlas');
      expect(explicitPerson.weeks[currentSprintNumber].planStatus).toBe('done');
      expect(explicitPerson.weeks[currentSprintNumber].retroStatus).toBe('done');
    });

    it('infers a project assignment from sprint issues when no explicit assignment exists', async () => {
      const res = await request(app)
        .get('/api/team/accountability-grid-v3')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);

      const platformGroup = res.body.programs.find((program: { id: string }) => program.id === programId);
      expect(platformGroup).toBeDefined();

      const inferredPerson = platformGroup.people.find((person: { id: string }) => person.id === inferredPersonId);
      expect(inferredPerson).toBeDefined();
      expect(inferredPerson.weeks[currentSprintNumber].projectId).toBe(projectId);
      expect(inferredPerson.weeks[currentSprintNumber].projectName).toBe('Project Atlas');
      expect(inferredPerson.weeks[currentSprintNumber].planStatus).toBe('future');
      expect(inferredPerson.weeks[currentSprintNumber].retroStatus).toBe('future');
    });
  });
});
