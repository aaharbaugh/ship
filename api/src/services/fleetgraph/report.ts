import { traceable } from 'langsmith/traceable';
import type { FleetGraphDirectorResponseOption } from '@ship/shared';
import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphAnalysis } from './analyze.js';
import type { FleetGraphPreparedRun } from './runner.js';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphDraftReportResult {
  reportId: string;
}

export interface FleetGraphPublishReportResult {
  reportId: string;
  publishedAt: string;
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
        fleetgraph_report_state: 'draft',
        quality_status: rootAnalysis.qualityStatus,
        quality_score: rootAnalysis.qualityScore,
        fleetgraph_report_mode: analysis.mode,
        fleetgraph_report_model: analysis.model,
        fleetgraph_generated_at: analysis.generatedAt,
        fleetgraph_director_response_options: buildDirectorResponseOptions(prepared, analysis),
      },
    });

    return { reportId: report.id };
  },
  fleetGraphTraceConfig('fleetgraph.create_quality_report_draft')
);

export async function publishFleetGraphQualityReport(
  client: FleetGraphShipApiClient,
  reportId: string
): Promise<FleetGraphPublishReportResult> {
  return tracedPublishFleetGraphQualityReport(client, reportId);
}

function buildDirectorResponseOptions(
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis
): FleetGraphDirectorResponseOption[] {
  const targetDocuments = analysis.documents
    .filter((document) => document.qualityStatus !== 'green')
    .sort((left, right) => compareStatus(right.qualityStatus, left.qualityStatus))
    .slice(0, 3);
  const titleById = new Map(
    prepared.context.expandedDocuments.map((document) => [document.id, document.title])
  );

  if (targetDocuments.length === 0) {
    return [
      {
        label: 'Acknowledge healthy graph',
        message: `FleetGraph found this graph healthy overall. Keep execution moving and rescan if the project context changes.`,
        target_document_id: prepared.rootDocumentId,
      },
    ];
  }

  const firstTarget = targetDocuments[0];
  if (!firstTarget) {
    return [];
  }
  const firstTitle = titleById.get(firstTarget.documentId) ?? firstTarget.documentId;

  return [
    {
      label: 'Address top blocker',
      message: `Please address the highest-risk gap in "${firstTitle}" before continuing. FleetGraph flagged it as ${firstTarget.qualityStatus}.`,
      target_document_id: firstTarget.documentId,
    },
    {
      label: 'Tighten scope and ownership',
      message: `Please tighten ownership and expected outcomes across the flagged work before the next review pass. Start with "${firstTitle}" and any linked follow-up items.`,
      target_document_id: firstTarget.documentId,
    },
    {
      label: 'Escalate blockers this cycle',
      message: `Please escalate the current blockers this cycle and update the affected documents with concrete next steps so the graph can return to green.`,
      target_document_id: prepared.rootDocumentId,
    },
  ];
}

const tracedPublishFleetGraphQualityReport = traceable(
  async function publishQualityReport(
    client: FleetGraphShipApiClient,
    reportId: string
  ): Promise<FleetGraphPublishReportResult> {
    const report = await client.getDocument(reportId);

    if (report.properties.fleetgraph_report_type !== 'quality_report') {
      throw new Error('FleetGraph publish requires a quality report document');
    }

    const publishedAt = new Date().toISOString();
    await client.updateDocumentMetadata(reportId, {
      ...(report.properties ?? {}),
      fleetgraph_report_state: 'published',
      fleetgraph_report_published_at: publishedAt,
    });

    return {
      reportId,
      publishedAt,
    };
  },
  fleetGraphTraceConfig('fleetgraph.publish_quality_report')
);

function buildQualityReportContent(
  prepared: FleetGraphPreparedRun,
  analysis: FleetGraphAnalysis,
  rootSummary: string
): string {
  const titleById = new Map(
    prepared.context.expandedDocuments.map((document) => [
      document.id,
      document.title,
    ])
  );
  const scoredDocuments = analysis.documents.map((document) => ({
    ...document,
    title:
      document.documentId === prepared.rootDocumentId
        ? prepared.context.rootDocument.title
        : titleById.get(document.documentId) ?? document.documentId,
  }));
  const redDocuments = scoredDocuments.filter((document) => document.qualityStatus === 'red');
  const yellowDocuments = scoredDocuments.filter((document) => document.qualityStatus === 'yellow');
  const topSuggestions = analysis.remediationSuggestions.slice(0, 5);
  const documentLines = scoredDocuments
    .sort((left, right) => compareStatus(right.qualityStatus, left.qualityStatus))
    .slice(0, 10)
    .map(
      (document) =>
        `- ${document.documentType} "${document.title}": ${document.qualityStatus.toUpperCase()} ${Math.round(document.qualityScore * 100)}%${document.tags.length > 0 ? ` | ${document.tags.map((tag) => tag.label).join(', ')}` : ''}`
    )
    .join('\n');
  const riskLines = [
    `Red documents: ${redDocuments.length}`,
    `Yellow documents: ${yellowDocuments.length}`,
    `Green documents: ${scoredDocuments.length - redDocuments.length - yellowDocuments.length}`,
    `Connected documents reviewed: ${prepared.graph.nodes.length}`,
    `Relationships traversed: ${prepared.graph.edges.length}`,
    `Graph depth reached: ${prepared.graph.metadata.maxDepthReached}`,
    prepared.graph.metadata.truncated
      ? `Traversal hit limits: yes (depth ${prepared.graph.metadata.depthLimit}, docs ${prepared.graph.metadata.documentLimit})`
      : 'Traversal hit limits: no',
  ].join('\n');
  const priorityBlock = buildPriorityBlock('Immediate attention', redDocuments);
  const watchBlock = buildPriorityBlock('Watch list', yellowDocuments);
  const suggestionLines = topSuggestions.length
    ? topSuggestions
        .map(
          (suggestion, index) =>
            `${index + 1}. ${suggestion.title} (${suggestion.priority})${suggestion.document_id ? `\n   Target: ${titleById.get(suggestion.document_id) ?? suggestion.document_id}` : ''}\n   ${suggestion.rationale}`
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
    '## Health Snapshot',
    riskLines,
    '',
    '## Priority Findings',
    priorityBlock,
    '',
    '## Watch List',
    watchBlock,
    '',
    '## Document Scores',
    documentLines,
    '',
    '## Recommended Actions',
    suggestionLines,
  ].join('\n');
}

function buildPriorityBlock(
  heading: string,
  documents: Array<{
    title: string;
    documentType: string;
    qualityScore: number;
    tags: Array<{ label: string }>;
  }>
): string {
  if (documents.length === 0) {
    return `${heading}: none`;
  }

  return documents
    .slice(0, 5)
    .map(
      (document) =>
        `- ${document.documentType} "${document.title}" at ${Math.round(document.qualityScore * 100)}%${document.tags.length > 0 ? ` because ${document.tags.map((tag) => tag.label.toLowerCase()).join(', ')}` : ''}`
    )
    .join('\n');
}

function compareStatus(
  left: 'green' | 'yellow' | 'red',
  right: 'green' | 'yellow' | 'red'
): number {
  return rankStatus(left) - rankStatus(right);
}

function rankStatus(status: 'green' | 'yellow' | 'red'): number {
  if (status === 'red') return 3;
  if (status === 'yellow') return 2;
  return 1;
}
