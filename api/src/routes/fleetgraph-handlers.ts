import { z } from 'zod';
import {
  createFleetGraphBearerClient,
  createFleetGraphSessionClient,
  type FleetGraphShipApiClient,
} from '../services/fleetgraph/client.js';
import { persistFleetGraphAnalysis } from '../services/fleetgraph/persist.js';
import { analyzeFleetGraphWithReasoning } from '../services/fleetgraph/reasoning.js';
import {
  createFleetGraphQualityReportDraft,
  deleteFleetGraphQualityReport,
  publishFleetGraphQualityReport,
  updateFleetGraphQualityReportDraft,
} from '../services/fleetgraph/report.js';
import {
  getFleetGraphReportDetail,
  getFleetGraphReviewSession,
  listFleetGraphReports,
} from '../services/fleetgraph/reports.js';
import { prepareFleetGraphRun } from '../services/fleetgraph/runner.js';
import { runFleetGraphWorkspaceScan } from '../services/fleetgraph/scan.js';
import { getFleetGraphQueueStatus } from '../services/fleetgraph/triggers.js';
import { sendFleetGraphDirectorFeedback } from '../services/fleetgraph/feedback.js';
import { getFleetGraphReadinessStatus } from '../services/fleetgraph/readiness.js';

const nightlyScanSchema = z.object({
  createDraftReports: z.boolean().optional(),
});

const directorFeedbackSchema = z.object({
  optionIndex: z.number().int().min(0),
});

export interface FleetGraphRouteContext {
  workspaceId?: string | null;
  workspaceRole?: string | null;
  isApiToken?: boolean;
  isSuperAdmin?: boolean;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  body?: unknown;
  protocol?: string;
  host?: string;
}

export interface FleetGraphRouteResult<TBody> {
  status: number;
  body: TBody;
}

function ok<TBody>(body: TBody): FleetGraphRouteResult<TBody> {
  return { status: 200, body };
}

function error(status: number, message: string, details?: unknown) {
  return {
    status,
    body: details ? { error: message, details } : { error: message },
  };
}

function hasAdminAccess(context: FleetGraphRouteContext): boolean {
  return Boolean(context.isApiToken || context.isSuperAdmin || context.workspaceRole === 'admin');
}

function getHeader(
  headers: FleetGraphRouteContext['headers'],
  name: string
): string | null {
  const value = headers[name];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return null;
}

function getInternalBaseUrl(context: FleetGraphRouteContext): string {
  if (process.env.INTERNAL_API_URL) {
    return process.env.INTERNAL_API_URL.replace(/\/$/, '');
  }

  return `${context.protocol ?? 'http'}://${context.host ?? 'localhost'}`;
}

export function createRouteClient(context: FleetGraphRouteContext): FleetGraphShipApiClient {
  const baseUrl = getInternalBaseUrl(context);
  const authHeader = getHeader(context.headers, 'authorization');

  if (authHeader?.startsWith('Bearer ')) {
    return createFleetGraphBearerClient(baseUrl, authHeader.slice(7));
  }

  const cookieHeader = getHeader(context.headers, 'cookie');
  const csrfToken = getHeader(context.headers, 'x-csrf-token');

  if (!cookieHeader) {
    throw new Error('Session cookie required for FleetGraph access');
  }

  return createFleetGraphSessionClient(baseUrl, cookieHeader, csrfToken);
}

export async function buildInsightsContext(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  const prepared = await prepareFleetGraphRun(client, {
    workspaceId: String(context.workspaceId),
    documentId: String(context.params.id),
    source: 'manual',
  });
  const analysis = await analyzeFleetGraphWithReasoning(prepared.scoringPayload);

  return { client, prepared, analysis };
}

export async function buildInsightsResponse(context: FleetGraphRouteContext) {
  const { prepared, analysis } = await buildInsightsContext(context);

  return {
    ...prepared,
    analysis,
  };
}

export async function getReportsHandler(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  return ok({
    reports: await listFleetGraphReports(client),
  });
}

export async function getReportDetailHandler(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  return ok({
    report: await getFleetGraphReportDetail(client, String(context.params.id)),
  });
}

export async function getReviewSessionHandler(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  return ok({
    session: await getFleetGraphReviewSession(client),
  });
}

export async function getQueueStatusHandler() {
  return ok(getFleetGraphQueueStatus());
}

export async function getReadinessHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'FleetGraph readiness requires workspace admin access');
  }

  return ok(getFleetGraphReadinessStatus());
}

export async function persistInsightsHandler(context: FleetGraphRouteContext) {
  const { client, analysis } = await buildInsightsContext(context);
  await persistFleetGraphAnalysis(client, analysis);

  return ok({
    persisted: analysis.documents.length,
    analysis,
  });
}

export async function createReportDraftHandler(context: FleetGraphRouteContext) {
  const { client, prepared, analysis } = await buildInsightsContext(context);
  const existingReportId =
    typeof prepared.context.rootDocument.properties.quality_report_id === 'string'
      ? prepared.context.rootDocument.properties.quality_report_id
      : null;

  if (existingReportId) {
    const report = await updateFleetGraphQualityReportDraft(
      client,
      existingReportId,
      prepared,
      analysis
    );
    for (const document of analysis.documents) {
      await client.updateDocumentMetadata(document.documentId, {
        ...document.metadata,
        quality_report_id: report.reportId,
      });
    }

    return ok({
      created: false,
      updated: true,
      reportId: existingReportId,
    });
  }

  const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
  for (const document of analysis.documents) {
    await client.updateDocumentMetadata(document.documentId, {
      ...document.metadata,
      quality_report_id: report.reportId,
    });
  }

  return ok({
    created: true,
    updated: false,
    reportId: report.reportId,
  });
}

export async function publishReportHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'Publishing FleetGraph reports requires workspace admin access');
  }

  const client = createRouteClient(context);
  return ok(await publishFleetGraphQualityReport(client, String(context.params.id)));
}

export async function deleteReportHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'Deleting FleetGraph reports requires workspace admin access');
  }

  const client = createRouteClient(context);
  return ok(await deleteFleetGraphQualityReport(client, String(context.params.id)));
}

export async function directorFeedbackHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'Sending FleetGraph director feedback requires workspace admin access');
  }

  const parsed = directorFeedbackSchema.safeParse(context.body ?? {});
  if (!parsed.success) {
    return error(400, 'Invalid FleetGraph director feedback payload', parsed.error.flatten());
  }

  const client = createRouteClient(context);
  return ok(
    await sendFleetGraphDirectorFeedback(client, String(context.params.id), parsed.data.optionIndex)
  );
}

export async function nightlyScanHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'FleetGraph nightly scans require workspace admin access');
  }

  const parsed = nightlyScanSchema.safeParse(context.body ?? {});
  if (!parsed.success) {
    return error(400, 'Invalid nightly scan payload', parsed.error.flatten());
  }

  const client = createRouteClient(context);
  return ok(
    await runFleetGraphWorkspaceScan(client, String(context.workspaceId), parsed.data)
  );
}
