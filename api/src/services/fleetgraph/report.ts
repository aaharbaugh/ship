import { traceable } from 'langsmith/traceable';
import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphAnalysis } from './analyze.js';
import type { FleetGraphPreparedRun } from './runner.js';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphDraftReportResult {
  reportId: string;
}

export async function createFleetGraphQualityReportDraft(
  client: FleetGraphShipApiClient,
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis
): Promise<FleetGraphDraftReportResult> {
  return tracedCreateFleetGraphQualityReportDraft(client, prepared, analysis);
}

const tracedCreateFleetGraphQualityReportDraft = traceable(
  async function createQualityReportDraft(
    client: FleetGraphShipApiClient,
    prepared: FleetGraphPreparedRun,
    analysis: FleetGraphAnalysis
  ): Promise<FleetGraphDraftReportResult> {
    const rootAnalysis =
      analysis.documents.find((document) => document.documentId === prepared.rootDocumentId) ??
      analysis.documents[0];

    if (!rootAnalysis) {
      throw new Error('Cannot create FleetGraph quality report draft without a root document analysis');
    }

    const report = await client.createQualityReportDraft({
      title: `FleetGraph Quality Report: ${prepared.context.rootDocument.title}`,
      content: buildQualityReportContent(prepared, analysis, rootAnalysis.summary),
      projectId: prepared.rootDocumentId,
      metadata: {
        fleetgraph_root_document_id: prepared.rootDocumentId,
        fleetgraph_trigger_source: prepared.triggerSource,
        quality_status: rootAnalysis.qualityStatus,
        quality_score: rootAnalysis.qualityScore,
        fleetgraph_report_mode: analysis.mode,
        fleetgraph_report_model: analysis.model,
        fleetgraph_generated_at: analysis.generatedAt,
      },
    });

    return { reportId: report.id };
  },
  fleetGraphTraceConfig('fleetgraph.create_quality_report_draft')
);

function buildQualityReportContent(
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis,
  rootSummary: string
): string {
  const topSuggestions = analysis.remediationSuggestions.slice(0, 5);
  const documentLines = analysis.documents
    .slice(0, 8)
    .map(
      (document) =>
        `- ${document.documentType} "${document.documentId === prepared.rootDocumentId ? prepared.context.rootDocument.title : document.documentId}": ${document.qualityStatus.toUpperCase()} ${Math.round(document.qualityScore * 100)}%`
    )
    .join('\n');
  const suggestionLines = topSuggestions.length
    ? topSuggestions
        .map(
          (suggestion, index) =>
            `${index + 1}. ${suggestion.title} (${suggestion.priority})\n   ${suggestion.rationale}`
        )
        .join('\n')
    : '1. No remediation suggestions generated.';

  return [
    '# FleetGraph Quality Report',
    '',
    `Root document: ${prepared.context.rootDocument.title}`,
    `Generated: ${analysis.generatedAt}`,
    `Mode: ${analysis.mode}${analysis.model ? ` (${analysis.model})` : ''}`,
    '',
    '## Summary',
    rootSummary,
    '',
    '## Document Scores',
    documentLines,
    '',
    '## Recommended Actions',
    suggestionLines,
  ].join('\n');
}
