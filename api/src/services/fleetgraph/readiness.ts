import { isFleetGraphLangSmithEnabled } from './tracing.js';

const DEFAULT_BATCH_INTERVAL_MS = 4 * 60 * 1000;
const DEFAULT_COLLAB_IDLE_MS = 90_000;
const DEFAULT_MAX_DOCUMENTS_PER_FLUSH = 24;
const DEFAULT_MAX_GRAPH_DEPTH = 2;
const DEFAULT_MAX_GRAPH_DOCUMENTS = 40;
const DEFAULT_LEASE_TIMEOUT_MS = 10 * 60 * 1000;

export interface FleetGraphReadinessStatus {
  ready: boolean;
  deployment: {
    nodeEnv: string;
    publicBaseUrl: string | null;
    internalApiUrl: string | null;
    publiclyAccessible: boolean;
  };
  runtime: {
    shipApiTokenConfigured: boolean;
    openAiConfigured: boolean;
    langSmithEnabled: boolean;
    langSmithProject: string | null;
    workerEnabled: boolean;
    durableQueueEnabled: boolean;
    queueIntervalMs: number;
    leaseTimeoutMs: number;
    maxDocumentsPerFlush: number;
    collaborationIdleMs: number;
    maxGraphDepth: number;
    maxGraphDocuments: number;
  };
  routes: {
    insights: string;
    reports: string;
    reviewSession: string;
    nightlyScanApi: string;
    nightlyScanScript: string;
  };
  missing: string[];
}

export function getFleetGraphReadinessStatus(): FleetGraphReadinessStatus {
  const publicBaseUrl = normalizeUrl(
    process.env.APP_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? null
  );
  const internalApiUrl = normalizeUrl(process.env.INTERNAL_API_URL ?? null);
  const publiclyAccessible = Boolean(publicBaseUrl?.startsWith('https://'));
  const missing: string[] = [];

  if (!process.env.SHIP_API_TOKEN) {
    missing.push('SHIP_API_TOKEN');
  }

  if (!process.env.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }

  if (!isFleetGraphLangSmithEnabled()) {
    missing.push('LANGSMITH_TRACING');
  }

  if (!process.env.LANGSMITH_API_KEY) {
    missing.push('LANGSMITH_API_KEY');
  }

  if (!publicBaseUrl) {
    missing.push('APP_BASE_URL');
  }

  return {
    ready: missing.length === 0,
    deployment: {
      nodeEnv: process.env.NODE_ENV ?? 'development',
      publicBaseUrl,
      internalApiUrl,
      publiclyAccessible,
    },
    runtime: {
      shipApiTokenConfigured: Boolean(process.env.SHIP_API_TOKEN),
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
      langSmithEnabled: isFleetGraphLangSmithEnabled(),
      langSmithProject: process.env.LANGSMITH_PROJECT ?? null,
      workerEnabled: process.env.FLEETGRAPH_WORKER_ENABLED !== 'false',
      durableQueueEnabled: true,
      queueIntervalMs: numberFromEnv(
        process.env.FLEETGRAPH_BATCH_INTERVAL_MS,
        DEFAULT_BATCH_INTERVAL_MS
      ),
      leaseTimeoutMs: numberFromEnv(
        process.env.FLEETGRAPH_LEASE_TIMEOUT_MS,
        DEFAULT_LEASE_TIMEOUT_MS
      ),
      maxDocumentsPerFlush: numberFromEnv(
        process.env.FLEETGRAPH_MAX_DOCUMENTS_PER_FLUSH,
        DEFAULT_MAX_DOCUMENTS_PER_FLUSH
      ),
      collaborationIdleMs: numberFromEnv(
        process.env.FLEETGRAPH_COLLAB_IDLE_MS,
        DEFAULT_COLLAB_IDLE_MS
      ),
      maxGraphDepth: numberFromEnv(
        process.env.FLEETGRAPH_MAX_GRAPH_DEPTH,
        DEFAULT_MAX_GRAPH_DEPTH
      ),
      maxGraphDocuments: numberFromEnv(
        process.env.FLEETGRAPH_MAX_GRAPH_DOCUMENTS,
        DEFAULT_MAX_GRAPH_DOCUMENTS
      ),
    },
    routes: {
      insights: '/api/fleetgraph/documents/:id',
      reports: '/team/reviews/fleetgraph',
      reviewSession: '/team/reviews/fleetgraph/session',
      nightlyScanApi: '/api/fleetgraph/nightly-scan',
      nightlyScanScript: 'pnpm fleetgraph:nightly-scan',
    },
    missing,
  };
}

function numberFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUrl(url: string | null): string | null {
  return url ? url.replace(/\/$/, '') : null;
}
