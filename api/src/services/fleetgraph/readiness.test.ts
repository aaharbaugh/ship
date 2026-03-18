import { afterEach, describe, expect, it } from 'vitest';
import { getFleetGraphReadinessStatus } from './readiness.js';

const ORIGINAL_ENV = { ...process.env };

describe('FleetGraph readiness', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('reports missing runtime requirements clearly', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.APP_BASE_URL;
    delete process.env.SHIP_API_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LANGSMITH_API_KEY;
    delete process.env.LANGSMITH_TRACING;
    delete process.env.LANGCHAIN_TRACING_V2;

    const readiness = getFleetGraphReadinessStatus();

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual([
      'SHIP_API_TOKEN',
      'OPENAI_API_KEY',
      'LANGSMITH_TRACING',
      'LANGSMITH_API_KEY',
      'APP_BASE_URL',
    ]);
    expect(readiness.deployment.publiclyAccessible).toBe(false);
  });

  it('reports a complete public runtime when all required env vars are present', () => {
    process.env.NODE_ENV = 'production';
    process.env.APP_BASE_URL = 'https://ship.example.com';
    process.env.INTERNAL_API_URL = 'https://ship.example.com';
    process.env.SHIP_API_TOKEN = 'ship_token';
    process.env.OPENAI_API_KEY = 'openai_key';
    process.env.LANGSMITH_API_KEY = 'ls_key';
    process.env.LANGSMITH_TRACING = 'true';
    process.env.LANGSMITH_PROJECT = 'fleetgraph-prod';
    process.env.FLEETGRAPH_BATCH_INTERVAL_MS = '240000';
    process.env.FLEETGRAPH_MAX_DOCUMENTS_PER_FLUSH = '42';
    process.env.FLEETGRAPH_COLLAB_IDLE_MS = '120000';
    process.env.FLEETGRAPH_MAX_GRAPH_DEPTH = '3';
    process.env.FLEETGRAPH_MAX_GRAPH_DOCUMENTS = '60';

    const readiness = getFleetGraphReadinessStatus();

    expect(readiness.ready).toBe(true);
    expect(readiness.missing).toEqual([]);
    expect(readiness.deployment.publiclyAccessible).toBe(true);
    expect(readiness.runtime.langSmithEnabled).toBe(true);
    expect(readiness.runtime.langSmithProject).toBe('fleetgraph-prod');
    expect(readiness.runtime.maxDocumentsPerFlush).toBe(42);
    expect(readiness.runtime.maxGraphDepth).toBe(3);
    expect(readiness.routes.nightlyScanScript).toBe('pnpm fleetgraph:nightly-scan');
  });
});
