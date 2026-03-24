import type {
  FleetGraphAlertTag,
  FleetGraphDirectorResponseOption,
} from '@ship/shared';
import { traceable } from 'langsmith/traceable';
import type { FleetGraphShipApiClient } from './client.js';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphDirectorFeedbackResult {
  reportId: string;
  option: FleetGraphDirectorResponseOption;
  targetDocumentIds: string[];
  sentAt: string;
}

export async function sendFleetGraphDirectorFeedback(
  client: FleetGraphShipApiClient,
  reportId: string,
  optionIndex: number
): Promise<FleetGraphDirectorFeedbackResult> {
  return tracedSendFleetGraphDirectorFeedback(client, reportId, optionIndex);
}

const tracedSendFleetGraphDirectorFeedback = traceable(
  async function sendDirectorFeedback(
    client: FleetGraphShipApiClient,
    reportId: string,
    optionIndex: number
  ): Promise<FleetGraphDirectorFeedbackResult> {
    const report = await client.getDocument(reportId);

    if (report.properties.fleetgraph_report_type !== 'quality_report') {
      throw new Error('Director feedback requires a FleetGraph quality report');
    }

    const options = parseDirectorResponseOptions(
      report.properties.fleetgraph_director_response_options
    );
    const option = options[optionIndex];

    if (!option) {
      throw new Error('Selected FleetGraph director response option was not found');
    }

    const targetDocumentIds = collectTargetDocumentIds(report, option);
    const sentAt = new Date().toISOString();
    const feedbackTag: FleetGraphAlertTag = {
      key: 'director_feedback',
      label: 'Director feedback available',
      severity: 'medium',
      source: 'fleetgraph',
    };

    for (const documentId of targetDocumentIds) {
      const document = await client.getDocument(documentId);
      const currentTags = Array.isArray(document.properties.quality_tags)
        ? document.properties.quality_tags
        : [];
      const nextTags = dedupeAlertTags([...currentTags, feedbackTag]);

      await client.updateDocumentMetadata(documentId, {
        ...(document.properties ?? {}),
        quality_tags: nextTags,
        quality_report_id:
          typeof document.properties.quality_report_id === 'string'
            ? document.properties.quality_report_id
            : reportId,
        fleetgraph_director_feedback: {
          report_id: reportId,
          message: option.message,
          sent_at: sentAt,
        },
        fleetgraph_director_feedback_sent_at: sentAt,
      });
    }

    await client.updateDocumentMetadata(reportId, {
      ...(report.properties ?? {}),
      fleetgraph_director_feedback_sent_at: sentAt,
      fleetgraph_director_feedback_last_option: option,
    });

    return {
      reportId,
      option,
      targetDocumentIds,
      sentAt,
    };
  },
  fleetGraphTraceConfig('fleetgraph.send_director_feedback')
);

function parseDirectorResponseOptions(value: unknown): FleetGraphDirectorResponseOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const option = entry as FleetGraphDirectorResponseOption;
    return typeof option.label === 'string' && typeof option.message === 'string'
      ? [option]
      : [];
  });
}

function collectTargetDocumentIds(
  report: Awaited<ReturnType<FleetGraphShipApiClient['getDocument']>>,
  option: FleetGraphDirectorResponseOption
): string[] {
  const ids = new Set<string>();

  if (typeof option.target_document_id === 'string') {
    ids.add(option.target_document_id);
  }

  if (
    typeof report.properties.fleetgraph_root_document_id === 'string' &&
    ids.size === 0
  ) {
    ids.add(report.properties.fleetgraph_root_document_id);
  }

  return [...ids];
}

function dedupeAlertTags(tags: unknown[]): FleetGraphAlertTag[] {
  const seen = new Set<string>();
  const result: FleetGraphAlertTag[] = [];

  for (const tag of tags) {
    if (!tag || typeof tag !== 'object') {
      continue;
    }

    const alertTag = tag as FleetGraphAlertTag;
    if (
      typeof alertTag.key !== 'string' ||
      typeof alertTag.label !== 'string' ||
      (alertTag.severity !== 'high' &&
        alertTag.severity !== 'medium' &&
        alertTag.severity !== 'low')
    ) {
      continue;
    }

    const key = `${alertTag.key}:${alertTag.label}:${alertTag.severity}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(alertTag);
  }

  return result;
}
