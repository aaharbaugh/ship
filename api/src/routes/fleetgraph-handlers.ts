import { z } from 'zod';
import {
  createFleetGraphBearerClient,
  createFleetGraphSessionClient,
  type FleetGraphShipApiClient,
} from '../services/fleetgraph/client.js';
import { persistFleetGraphAnalysis } from '../services/fleetgraph/persist.js';
import {
  analyzeFleetGraphForPurpose,
  type FleetGraphAnalysisPurpose,
} from '../services/fleetgraph/reasoning.js';
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
import {
  answerFleetGraphQuestion,
  type FleetGraphChatMessage,
} from '../services/fleetgraph/chat.js';
import { withFleetGraphTraceAnalysis } from '../services/fleetgraph/tracing.js';
import {
  getFleetGraphLiveReviewRun,
  startFleetGraphLiveReviewRun,
} from '../services/fleetgraph/live-run.js';

const nightlyScanSchema = z.object({
  createDraftReports: z.boolean().optional(),
});

const directorFeedbackSchema = z.object({
  optionIndex: z.number().int().min(0),
});

const chatRequestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string().trim().min(1).max(4000),
    })
  ).max(12).optional(),
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

function isMissingDocumentError(caught: unknown): boolean {
  return caught instanceof Error && /\bfailed \(404\)\b/.test(caught.message);
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

export async function buildInsightsContext(
  context: FleetGraphRouteContext,
  purpose: FleetGraphAnalysisPurpose = 'insights'
) {
  const client = createRouteClient(context);
  const prepared = await prepareFleetGraphRun(client, {
    workspaceId: String(context.workspaceId),
    documentId: String(context.params.id),
    source: 'manual',
  });
  const analysis = await analyzeFleetGraphForPurpose(prepared.scoringPayload, {
    triggerSource: 'manual',
    purpose,
  });

  return { client, prepared, analysis };
}

export async function buildInsightsResponse(context: FleetGraphRouteContext) {
  const { prepared, analysis } = await buildInsightsContext(context, 'insights');

  return {
    ...prepared,
    trace: prepared.trace ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'insights') : undefined,
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
  try {
    return ok({
      report: await getFleetGraphReportDetail(client, String(context.params.id)),
    });
  } catch (caught) {
    if (isMissingDocumentError(caught)) {
      return error(404, 'FleetGraph report not found');
    }

    throw caught;
  }
}

export async function getReviewSessionHandler(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  return ok({
    session: await getFleetGraphReviewSession(client),
  });
}

export async function getQueueStatusHandler() {
  return ok(await getFleetGraphQueueStatus());
}

export async function getReadinessHandler(context: FleetGraphRouteContext) {
  if (!hasAdminAccess(context)) {
    return error(403, 'FleetGraph readiness requires workspace admin access');
  }

  return ok(getFleetGraphReadinessStatus());
}

export async function persistInsightsHandler(context: FleetGraphRouteContext) {
  const { client, prepared, analysis } = await buildInsightsContext(context, 'persist');
  await persistFleetGraphAnalysis(client, analysis);

  return ok({
    persisted: analysis.documents.length,
    trace: prepared.trace ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'persist') : undefined,
    analysis,
  });
}

export async function createReportDraftHandler(context: FleetGraphRouteContext) {
  const { client, prepared, analysis } = await buildInsightsContext(context, 'draft_report');
  const existingReportId =
    typeof prepared.context.rootDocument.properties.quality_report_id === 'string'
      ? prepared.context.rootDocument.properties.quality_report_id
      : null;

  if (existingReportId) {
    try {
      const report = await updateFleetGraphQualityReportDraft(
        client,
        existingReportId,
        prepared,
        analysis
      );
      await client.updateDocumentMetadata(prepared.rootDocumentId, {
        ...(prepared.context.rootDocument.properties ?? {}),
        quality_report_id: report.reportId,
      });

      return ok({
        created: false,
        updated: true,
        reportId: existingReportId,
        trace: prepared.trace ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'draft_report') : undefined,
      });
    } catch (caught) {
      if (!isMissingDocumentError(caught)) {
        throw caught;
      }

      const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
      await client.updateDocumentMetadata(prepared.rootDocumentId, {
        ...(prepared.context.rootDocument.properties ?? {}),
        quality_report_id: report.reportId,
      });

      return ok({
        created: true,
        updated: false,
        reportId: report.reportId,
        trace: prepared.trace ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'draft_report') : undefined,
      });
    }
  }

  const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
  await client.updateDocumentMetadata(prepared.rootDocumentId, {
    ...(prepared.context.rootDocument.properties ?? {}),
    quality_report_id: report.reportId,
  });

  return ok({
    created: true,
    updated: false,
    reportId: report.reportId,
    trace: prepared.trace ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'draft_report') : undefined,
  });
}

export async function chatHandler(context: FleetGraphRouteContext) {
  const parsed = chatRequestSchema.safeParse(context.body ?? {});
  if (!parsed.success) {
    return error(400, 'Invalid FleetGraph chat payload', parsed.error.flatten());
  }

  const { prepared, analysis } = await buildInsightsContext(context, 'chat');
  return ok(
    await answerFleetGraphQuestion(
      prepared,
      analysis,
      parsed.data.question,
      (parsed.data.history ?? []) as FleetGraphChatMessage[]
    )
  );
}

export async function startLiveReviewHandler(context: FleetGraphRouteContext) {
  const client = createRouteClient(context);
  return ok({
    run: startFleetGraphLiveReviewRun({
      client,
      workspaceId: String(context.workspaceId),
      documentId: String(context.params.id),
    }),
  });
}

export async function getLiveReviewHandler(context: FleetGraphRouteContext) {
  const runId = String(context.params.runId);
  const run = getFleetGraphLiveReviewRun(runId);
  if (!run) {
    return error(404, 'FleetGraph live review run not found');
  }

  return ok({ run });
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
