import { traceable } from 'langsmith/traceable';
import type { FleetGraphShipApiClient } from './client.js';
import { fleetGraphTraceConfig } from './tracing.js';

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

export async function listFleetGraphReports(
  client: FleetGraphShipApiClient
): Promise<FleetGraphReportListItem[]> {
  return tracedListFleetGraphReports(client);
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
