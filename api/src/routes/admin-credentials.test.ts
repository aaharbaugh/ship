import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockLogAuditEvent,
  mockIsCAIAConfigured,
  mockValidateIssuerDiscovery,
  mockResetCAIAClient,
  mockGetCAIACredentials,
  mockSaveCAIACredentials,
  mockGetCAIASecretPath,
  mockGetChangedFields,
} = vi.hoisted(() => ({
  mockLogAuditEvent: vi.fn(),
  mockIsCAIAConfigured: vi.fn(),
  mockValidateIssuerDiscovery: vi.fn(),
  mockResetCAIAClient: vi.fn(),
  mockGetCAIACredentials: vi.fn(),
  mockSaveCAIACredentials: vi.fn(),
  mockGetCAIASecretPath: vi.fn(),
  mockGetChangedFields: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.userId = 'super-admin-user';
    next();
  },
  superAdminMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  },
}));

vi.mock('../services/audit.js', () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock('../services/caia.js', () => ({
  isCAIAConfigured: mockIsCAIAConfigured,
  validateIssuerDiscovery: mockValidateIssuerDiscovery,
  resetCAIAClient: mockResetCAIAClient,
}));

vi.mock('../services/secrets-manager.js', () => ({
  getCAIACredentials: mockGetCAIACredentials,
  saveCAIACredentials: mockSaveCAIACredentials,
  getCAIASecretPath: mockGetCAIASecretPath,
  getChangedFields: mockGetChangedFields,
}));

import adminCredentialsRouter from './admin-credentials.js';

type RouteMethod = 'get' | 'post';

interface MockRequest {
  body?: Record<string, unknown>;
  userId?: string;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  text: string | null;
  redirectedTo: string | null;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  send: (payload: unknown) => MockResponse;
  redirect: (location: string) => MockResponse;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    text: null,
    redirectedTo: null,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.text = typeof payload === 'string' ? payload : JSON.stringify(payload);
      this.body = payload;
      return this;
    },
    redirect(location: string) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
  };
}

async function invokeRoute(method: RouteMethod, path: string, reqOverrides: MockRequest = {}) {
  const layer = adminCredentialsRouter.stack.find((entry) =>
    entry.route?.path === path && Boolean((entry.route as express.IRoute & { methods?: Record<string, boolean> }).methods?.[method])
  );

  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const req = {
    method: method.toUpperCase(),
    path,
    body: {},
    headers: {},
    ...reqOverrides,
  } as express.Request;
  const res = createMockResponse() as unknown as express.Response & MockResponse;
  const handlers = layer.route.stack.map((entry: { handle: Function }) => entry.handle);

  for (const handler of handlers) {
    await new Promise<void>((resolve, reject) => {
      try {
        const maybePromise = handler(req, res, (err?: unknown) => err ? reject(err) : resolve());
        if (maybePromise?.then) {
          maybePromise.then(() => resolve()).catch(reject);
        } else if (handler.length < 3) {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  return res;
}

function getJsonBody<T>(res: MockResponse): T {
  return res.body as T;
}

describe('admin credentials routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_BASE_URL = 'https://ship.example.gov';

    mockGetCAIASecretPath.mockReturnValue('/ship/dev/caia');
    mockGetChangedFields.mockReturnValue(['issuer_url', 'client_id']);
    mockGetCAIACredentials.mockResolvedValue({
      configured: false,
      credentials: null,
      error: null,
    });
    mockIsCAIAConfigured.mockResolvedValue(false);
    mockValidateIssuerDiscovery.mockResolvedValue({ issuer: 'https://issuer.example.gov' });
    mockSaveCAIACredentials.mockResolvedValue(undefined);
    mockLogAuditEvent.mockResolvedValue(undefined);
  });

  it('renders the current credential status page with escaped values', async () => {
    mockGetCAIACredentials.mockResolvedValue({
      configured: true,
      credentials: {
        issuer_url: 'https://issuer.example.gov/<unsafe>',
        client_id: 'client<&>"\'',
        client_secret: 'secret-value',
      },
      error: null,
    });

    const res = await invokeRoute('get', '/');

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('CAIA Credentials');
    expect(res.text).toContain('https://ship.example.gov/api/auth/piv/callback');
    expect(res.text).toContain('/ship/dev/caia');
    expect(res.text).toContain('https://issuer.example.gov/&lt;unsafe&gt;');
    expect(res.text).toContain('client&lt;&amp;&gt;&quot;&#039;');
    expect(res.text).not.toContain('secret-value');
  });

  it('rejects save requests when required fields are missing', async () => {
    const res = await invokeRoute('post', '/save', {
      body: { issuer_url: '', client_id: 'client-id' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'Issuer URL and Client ID are required' },
    });
    expect(mockSaveCAIACredentials).not.toHaveBeenCalled();
  });

  it('requires a client secret when no stored secret exists', async () => {
    mockGetCAIACredentials.mockResolvedValue({
      configured: false,
      credentials: {
        issuer_url: 'https://issuer.example.gov',
        client_id: 'existing-client',
        client_secret: '',
      },
      error: null,
    });

    const res = await invokeRoute('post', '/save', {
      body: {
        issuer_url: 'https://issuer.example.gov',
        client_id: 'client-id',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'Client Secret is required' },
    });
    expect(mockSaveCAIACredentials).not.toHaveBeenCalled();
  });

  it('saves credentials, resets the CAIA client, and logs the audit event', async () => {
    mockGetCAIACredentials.mockResolvedValue({
      configured: true,
      credentials: {
        issuer_url: 'https://old-issuer.example.gov',
        client_id: 'old-client',
        client_secret: 'existing-secret',
      },
      error: null,
    });

    const res = await invokeRoute('post', '/save', {
      body: {
        issuer_url: 'https://issuer.example.gov',
        client_id: 'new-client',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Credentials saved successfully! Issuer discovery validated.',
    });
    expect(mockSaveCAIACredentials).toHaveBeenCalledWith({
      issuer_url: 'https://issuer.example.gov',
      client_id: 'new-client',
      client_secret: 'existing-secret',
    });
    expect(mockResetCAIAClient).toHaveBeenCalledOnce();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'super-admin-user',
      action: 'admin.update_caia_credentials',
      details: {
        changedFields: ['issuer_url', 'client_id'],
        secretPath: '/ship/dev/caia',
      },
    }));
  });

  it('returns a warning when issuer discovery validation fails but the save succeeds', async () => {
    mockGetCAIACredentials.mockResolvedValue({
      configured: true,
      credentials: {
        issuer_url: 'https://old-issuer.example.gov',
        client_id: 'old-client',
        client_secret: 'existing-secret',
      },
      error: null,
    });
    mockValidateIssuerDiscovery.mockRejectedValue(new Error('discovery unreachable'));

    const res = await invokeRoute('post', '/save', {
      body: {
        issuer_url: 'https://issuer.example.gov',
        client_id: 'new-client',
        client_secret: 'new-secret',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = getJsonBody<{ success: boolean; warning?: string; message: string }>(res);
    expect(body.success).toBe(true);
    expect(body.warning).toBe('Issuer discovery failed: discovery unreachable');
    expect(body.message).toContain('Warning: Issuer discovery failed: discovery unreachable');
    expect(mockSaveCAIACredentials).toHaveBeenCalledWith({
      issuer_url: 'https://issuer.example.gov',
      client_id: 'new-client',
      client_secret: 'new-secret',
    });
  });

  it('reports test-api failures when CAIA is not configured', async () => {
    const res = await invokeRoute('post', '/test-api');

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: { message: 'CAIA is not configured. Save credentials first.' },
    });
    expect(mockValidateIssuerDiscovery).not.toHaveBeenCalled();
  });

  it('tests a configured CAIA connection and logs success', async () => {
    mockIsCAIAConfigured.mockResolvedValue(true);
    mockGetCAIACredentials.mockResolvedValue({
      configured: true,
      credentials: {
        issuer_url: 'https://issuer.example.gov',
        client_id: 'client-id',
        client_secret: 'secret-value',
      },
      error: null,
    });
    mockValidateIssuerDiscovery.mockResolvedValue({ issuer: 'https://issuer.example.gov' });

    const res = await invokeRoute('post', '/test-api');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'CAIA connection successful! Issuer: https://issuer.example.gov',
    });
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'super-admin-user',
      action: 'admin.test_caia_connection',
      details: { success: true, issuer: 'https://issuer.example.gov' },
    }));
  });
});
