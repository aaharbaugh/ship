import { traceable } from 'langsmith/traceable';
import type { FleetGraphShipApiClient } from './client.js';
import { fleetGraphTraceConfig } from './tracing.js';
import { extractText } from '../../utils/document-content.js';

export interface FleetGraphReportListItem {
  id: string;
  title: string;
  rootDocumentId: string | null;
  rootDocumentTitle: string | null;
  rootDocumentType: string | null;
  state: 'draft' | 'published';
  qualityStatus: 'green' | 'yellow' | 'red' | null;
  qualityScore: number | null;
  generatedAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  directorResponseOptions: Array<{
    label: string;
    message: string;
    targetDocumentId: string | null;
  }>;
  directorFeedbackSentAt: string | null;
}

export interface FleetGraphReportDetail {
  report: FleetGraphReportListItem;
  reportContentText: string;
  rootDocument: {
    id: string;
    title: string;
    documentType: string;
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    qualitySummary: string | null;
    lastScoredAt: string | null;
    directorFeedbackSentAt: string | null;
  } | null;
  targetDocuments: Array<{
    id: string;
    title: string;
    documentType: string;
    qualityStatus: 'green' | 'yellow' | 'red' | null;
    qualityScore: number | null;
    qualitySummary: string | null;
    directorFeedbackSentAt: string | null;
  }>;
}

export interface FleetGraphReviewSession {
  generatedAt: string;
  totalReports: number;
  totalFindings: number;
  redFindings: number;
  yellowFindings: number;
  draftReports: number;
  publishedReports: number;
  findings: Array<{
    reportId: string;
    reportTitle: string;
    reportState: 'draft' | 'published';
    reportQualityStatus: 'green' | 'yellow' | 'red' | null;
    rootDocumentId: string | null;
    rootDocumentTitle: string | null;
    rootDocumentType: string | null;
    focusDocumentId: string;
    focusDocumentTitle: string;
    focusDocumentType: string;
    focusQualityStatus: 'green' | 'yellow' | 'red' | null;
    focusQualityScore: number | null;
    focusQualitySummary: string | null;
    directorFeedbackSentAt: string | null;
    directorResponseOptionsCount: number;
  }>;
}

export async function listFleetGraphReports(
  client: FleetGraphShipApiClient
): Promise<FleetGraphReportListItem[]> {
  return tracedListFleetGraphReports(client);
}

export async function getFleetGraphReportDetail(
  client: FleetGraphShipApiClient,
  reportId: string
): Promise<FleetGraphReportDetail> {
  return tracedGetFleetGraphReportDetail(client, reportId);
}

export async function getFleetGraphReviewSession(
  client: FleetGraphShipApiClient
): Promise<FleetGraphReviewSession> {
  return tracedGetFleetGraphReviewSession(client);
}

const tracedListFleetGraphReports = traceable(
  async function listReports(
    client: FleetGraphShipApiClient
  ): Promise<FleetGraphReportListItem[]> {
    const documents = await client.listDocuments({ type: 'wiki' });
    const reportDocs = documents.filter(
      (document) => document.properties.fleetgraph_report_type === 'quality_report'
    );
    const rootIds = [...new Set(
      reportDocs.flatMap((document) =>
        typeof document.properties.fleetgraph_root_document_id === 'string'
          ? [document.properties.fleetgraph_root_document_id]
          : []
      )
    )];
    const rootDocuments = await Promise.all(
      rootIds.map(async (rootId) => {
        try {
          return await client.getDocument(rootId);
        } catch {
          return null;
        }
      })
    );
    const rootById = new Map(
      rootDocuments
        .filter((document): document is NonNullable<typeof document> => document !== null)
        .map((document) => [document.id, document])
    );

    return reportDocs
      .map((document) => ({
        id: document.id,
        title: document.title,
        rootDocumentId:
          typeof document.properties.fleetgraph_root_document_id === 'string'
            ? document.properties.fleetgraph_root_document_id
            : null,
        rootDocumentTitle:
          typeof document.properties.fleetgraph_root_document_id === 'string'
            ? rootById.get(document.properties.fleetgraph_root_document_id)?.title ?? null
            : null,
        rootDocumentType:
          typeof document.properties.fleetgraph_root_document_id === 'string'
            ? rootById.get(document.properties.fleetgraph_root_document_id)?.document_type ?? null
            : null,
        state: parseReportState(document.properties.fleetgraph_report_state),
        qualityStatus: parseQualityStatus(document.properties.quality_status),
        qualityScore:
          typeof document.properties.quality_score === 'number'
            ? document.properties.quality_score
            : null,
        generatedAt:
          typeof document.properties.fleetgraph_generated_at === 'string'
            ? document.properties.fleetgraph_generated_at
            : null,
        updatedAt: document.updated_at ?? null,
        publishedAt:
          typeof document.properties.fleetgraph_report_published_at === 'string'
            ? document.properties.fleetgraph_report_published_at
            : null,
        directorResponseOptions: parseDirectorResponseOptions(
          document.properties.fleetgraph_director_response_options
        ),
        directorFeedbackSentAt:
          typeof document.properties.fleetgraph_director_feedback_sent_at === 'string'
            ? document.properties.fleetgraph_director_feedback_sent_at
            : null,
      }))
      .sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt ?? left.generatedAt ?? '');
        const rightTime = Date.parse(right.updatedAt ?? right.generatedAt ?? '');
        return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
      })
      .slice(0, 10);
  },
  fleetGraphTraceConfig('fleetgraph.list_reports')
);

const tracedGetFleetGraphReportDetail = traceable(
  async function getReportDetail(
    client: FleetGraphShipApiClient,
    reportId: string
  ): Promise<FleetGraphReportDetail> {
    const reportDocument = await client.getDocument(reportId);
    const report = await buildReportListItem(client, reportDocument);
    const rootDocument = report.rootDocumentId
      ? await safeGetDocument(client, report.rootDocumentId)
      : null;
    const targetIds = [
      ...new Set(
        report.directorResponseOptions.flatMap((option) =>
          option.targetDocumentId ? [option.targetDocumentId] : []
        )
      ),
    ];
    const targetDocuments = await Promise.all(
      targetIds.map(async (documentId) => safeGetDocument(client, documentId))
    );

    return {
      report,
      reportContentText: extractText(reportDocument.content ?? null).trim(),
      rootDocument: rootDocument ? toLinkedDocumentSummary(rootDocument) : null,
      targetDocuments: targetDocuments
        .filter((document): document is NonNullable<typeof document> => document !== null)
        .map(toLinkedDocumentSummary),
    };
  },
  fleetGraphTraceConfig('fleetgraph.get_report_detail')
);

const tracedGetFleetGraphReviewSession = traceable(
  async function getReviewSession(
    client: FleetGraphShipApiClient
  ): Promise<FleetGraphReviewSession> {
    const reports = await listFleetGraphReports(client);
    const details = await Promise.all(
      reports.map(async (report) => {
        try {
          return await getFleetGraphReportDetail(client, report.id);
        } catch {
          return null;
        }
      })
    );
    const findings = details
      .filter((detail): detail is FleetGraphReportDetail => detail !== null)
      .flatMap((detail) => {
        const focusDocuments =
          detail.targetDocuments.length > 0
            ? detail.targetDocuments
            : detail.rootDocument
              ? [detail.rootDocument]
              : [];

        return focusDocuments.map((document) => ({
          reportId: detail.report.id,
          reportTitle: detail.report.title,
          reportState: detail.report.state,
          reportQualityStatus: detail.report.qualityStatus,
          rootDocumentId: detail.report.rootDocumentId,
          rootDocumentTitle: detail.report.rootDocumentTitle,
          rootDocumentType: detail.report.rootDocumentType,
          focusDocumentId: document.id,
          focusDocumentTitle: document.title,
          focusDocumentType: document.documentType,
          focusQualityStatus: document.qualityStatus,
          focusQualityScore: document.qualityScore,
          focusQualitySummary: document.qualitySummary,
          directorFeedbackSentAt: document.directorFeedbackSentAt,
          directorResponseOptionsCount: detail.report.directorResponseOptions.length,
        }));
      })
      .sort((left, right) => {
        const severityDelta =
          rankStatus(right.focusQualityStatus) - rankStatus(left.focusQualityStatus);
        if (severityDelta !== 0) {
          return severityDelta;
        }

        const draftDelta = Number(left.reportState === 'draft') - Number(right.reportState === 'draft');
        if (draftDelta !== 0) {
          return -draftDelta;
        }

        return left.focusDocumentTitle.localeCompare(right.focusDocumentTitle);
      });

    return {
      generatedAt: new Date().toISOString(),
      totalReports: reports.length,
      totalFindings: findings.length,
      redFindings: findings.filter((finding) => finding.focusQualityStatus === 'red').length,
      yellowFindings: findings.filter((finding) => finding.focusQualityStatus === 'yellow').length,
      draftReports: reports.filter((report) => report.state === 'draft').length,
      publishedReports: reports.filter((report) => report.state === 'published').length,
      findings,
    };
  },
  fleetGraphTraceConfig('fleetgraph.get_review_session')
);

async function buildReportListItem(
  client: FleetGraphShipApiClient,
  document: Awaited<ReturnType<FleetGraphShipApiClient['getDocument']>>
): Promise<FleetGraphReportListItem> {
  const rootDocumentId =
    typeof document.properties.fleetgraph_root_document_id === 'string'
      ? document.properties.fleetgraph_root_document_id
      : null;
  const rootDocument = rootDocumentId ? await safeGetDocument(client, rootDocumentId) : null;

  return {
    id: document.id,
    title: document.title,
    rootDocumentId,
    rootDocumentTitle: rootDocument?.title ?? null,
    rootDocumentType: rootDocument?.document_type ?? null,
    state: parseReportState(document.properties.fleetgraph_report_state),
    qualityStatus: parseQualityStatus(document.properties.quality_status),
    qualityScore:
      typeof document.properties.quality_score === 'number'
        ? document.properties.quality_score
        : null,
    generatedAt:
      typeof document.properties.fleetgraph_generated_at === 'string'
        ? document.properties.fleetgraph_generated_at
        : null,
    updatedAt: document.updated_at ?? null,
    publishedAt:
      typeof document.properties.fleetgraph_report_published_at === 'string'
        ? document.properties.fleetgraph_report_published_at
        : null,
    directorResponseOptions: parseDirectorResponseOptions(
      document.properties.fleetgraph_director_response_options
    ),
    directorFeedbackSentAt:
      typeof document.properties.fleetgraph_director_feedback_sent_at === 'string'
        ? document.properties.fleetgraph_director_feedback_sent_at
        : null,
  };
}

async function safeGetDocument(
  client: FleetGraphShipApiClient,
  documentId: string
) {
  try {
    return await client.getDocument(documentId);
  } catch {
    return null;
  }
}

function toLinkedDocumentSummary(
  document: Awaited<ReturnType<FleetGraphShipApiClient['getDocument']>>
) {
  return {
    id: document.id,
    title: document.title,
    documentType: document.document_type,
    qualityStatus: parseQualityStatus(document.properties.quality_status),
    qualityScore:
      typeof document.properties.quality_score === 'number'
        ? document.properties.quality_score
        : null,
    qualitySummary:
      typeof document.properties.quality_summary === 'string'
        ? document.properties.quality_summary
        : null,
    lastScoredAt:
      typeof document.properties.last_scored_at === 'string'
        ? document.properties.last_scored_at
        : null,
    directorFeedbackSentAt:
      typeof document.properties.fleetgraph_director_feedback_sent_at === 'string'
        ? document.properties.fleetgraph_director_feedback_sent_at
        : null,
  };
}

function parseQualityStatus(
  value: unknown
): 'green' | 'yellow' | 'red' | null {
  if (value === 'green' || value === 'yellow' || value === 'red') {
    return value;
  }

  return null;
}

function parseDirectorResponseOptions(
  value: unknown
): Array<{
  label: string;
  message: string;
  targetDocumentId: string | null;
}> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const option = entry as {
      label?: unknown;
      message?: unknown;
      target_document_id?: unknown;
    };

    if (typeof option.label !== 'string' || typeof option.message !== 'string') {
      return [];
    }

    return [
      {
        label: option.label,
        message: option.message,
        targetDocumentId:
          typeof option.target_document_id === 'string'
            ? option.target_document_id
            : null,
      },
    ];
  });
}

function parseReportState(
  value: unknown
): 'draft' | 'published' {
  return value === 'published' ? 'published' : 'draft';
}

function rankStatus(status: 'green' | 'yellow' | 'red' | null): number {
  if (status === 'red') return 3;
  if (status === 'yellow') return 2;
  if (status === 'green') return 1;
  return 0;
}
