import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockIsCAIAConfigured,
  mockGetAuthorizationUrl,
  mockHandleCallback,
  mockStoreOAuthState,
  mockConsumeOAuthState,
  mockLogAuditEvent,
} = vi.hoisted(() => ({
  mockIsCAIAConfigured: vi.fn(),
  mockGetAuthorizationUrl: vi.fn(),
  mockHandleCallback: vi.fn(),
  mockStoreOAuthState: vi.fn(),
  mockConsumeOAuthState: vi.fn(),
  mockLogAuditEvent: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../services/caia.js', () => ({
  isCAIAConfigured: mockIsCAIAConfigured,
  getAuthorizationUrl: mockGetAuthorizationUrl,
  handleCallback: mockHandleCallback,
}));

vi.mock('../services/oauth-state.js', () => ({
  generateSecureSessionId: vi.fn(),
  storeOAuthState: mockStoreOAuthState,
  consumeOAuthState: mockConsumeOAuthState,
}));

vi.mock('../services/audit.js', () => ({
  logAuditEvent: mockLogAuditEvent,
}));

vi.mock('../services/invite-acceptance.js', () => ({
  linkUserToWorkspaceViaInvite: vi.fn(),
}));

import caiaAuthRouter from './caia-auth.js';

type RouteMethod = 'get' | 'post';

interface MockRequest {
  query?: Record<string, unknown>;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  redirectedTo: string | null;
  cookiesSet: Array<{ name: string; value: string; options?: unknown }>;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  redirect: (location: string) => MockResponse;
  cookie: (name: string, value: string, options?: unknown) => MockResponse;
  setHeader: (name: string, value: string) => void;
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    redirectedTo: null,
    cookiesSet: [],
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    redirect(location: string) {
      this.statusCode = 302;
      this.redirectedTo = location;
      return this;
    },
    cookie(name: string, value: string, options?: unknown) {
      this.cookiesSet.push({ name, value, options });
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
  };
}

async function invokeRoute(method: RouteMethod, path: string, reqOverrides: MockRequest = {}) {
  const layer = caiaAuthRouter.stack.find((entry) =>
    entry.route?.path === path &&
    Boolean((entry.route as express.IRoute & { methods?: Record<string, boolean> }).methods?.[method])
  );

  if (!layer?.route) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  const req = {
    method: method.toUpperCase(),
    path,
    query: {},
    cookies: {},
    headers: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    ...reqOverrides,
  } as express.Request;
  const res = createMockResponse() as unknown as express.Response & MockResponse;
  const handlers = layer.route.stack.map((entry: { handle: Function }) => entry.handle);

  for (const handler of handlers) {
    await new Promise<void>((resolve, reject) => {
      try {
        const maybePromise = handler(req, res, (err?: unknown) => (err ? reject(err) : resolve()));
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

describe('caia auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCAIAConfigured.mockResolvedValue(true);
    mockGetAuthorizationUrl.mockResolvedValue({
      url: 'https://caia.example.gov/oauth/authorize?state=test-state',
      state: 'test-state',
      nonce: 'test-nonce',
      codeVerifier: 'test-code-verifier',
    });
    mockStoreOAuthState.mockResolvedValue(undefined);
    mockConsumeOAuthState.mockResolvedValue(null);
    mockHandleCallback.mockResolvedValue({
      user: {
        email: 'person@agency.gov',
        givenName: 'Pat',
        familyName: 'Jones',
        csp: 'Treasury',
      },
    });
    mockLogAuditEvent.mockResolvedValue(undefined);
  });

  it('reports CAIA availability from the configured auth service', async () => {
    mockIsCAIAConfigured.mockResolvedValue(true);

    const res = await invokeRoute('get', '/status');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { available: true },
    });
  });

  it('rejects login initiation when CAIA is not configured', async () => {
    mockIsCAIAConfigured.mockResolvedValue(false);

    const res = await invokeRoute('get', '/login');

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'CAIA_NOT_CONFIGURED',
        message: 'CAIA authentication not configured',
      },
    });
    expect(mockGetAuthorizationUrl).not.toHaveBeenCalled();
    expect(mockStoreOAuthState).not.toHaveBeenCalled();
  });

  it('stores OAuth state and returns an authorization URL for configured login flows', async () => {
    const res = await invokeRoute('get', '/login');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        authorizationUrl: 'https://caia.example.gov/oauth/authorize?state=test-state',
      },
    });
    expect(mockStoreOAuthState).toHaveBeenCalledWith('test-state', 'test-nonce', 'test-code-verifier');
  });

  it('rejects callbacks missing the OAuth state parameter and logs the failure', async () => {
    const res = await invokeRoute('get', '/callback', {
      query: { code: 'auth-code' },
    });

    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('/login?error=Missing+state');
    expect(mockConsumeOAuthState).not.toHaveBeenCalled();
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.caia_login_failed',
      details: { reason: 'missing_state_param' },
    }));
  });

  it('rejects callbacks with invalid non-government email claims before user creation', async () => {
    mockConsumeOAuthState.mockResolvedValue({
      nonce: 'test-nonce',
      codeVerifier: 'test-code-verifier',
    });
    mockHandleCallback.mockResolvedValue({
      user: {
        email: 'contractor@example.com',
        givenName: 'Pat',
        familyName: 'Jones',
        csp: 'Treasury',
      },
    });

    const res = await invokeRoute('get', '/callback', {
      query: { code: 'auth-code', state: 'test-state' },
    });

    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('/login?error=Invalid+email+format');
    expect(mockLogAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'auth.caia_login_failed',
      details: expect.objectContaining({
        reason: 'invalid_email_format',
        email: 'contractor@example.com',
      }),
    }));
  });
});
