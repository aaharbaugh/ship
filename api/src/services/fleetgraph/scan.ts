import { traceable } from 'langsmith/traceable';
import type { FleetGraphQualityStatus } from '@ship/shared';
import type { FleetGraphShipApiClient } from './client.js';
import { persistFleetGraphAnalysis } from './persist.js';
import { analyzeFleetGraphWithReasoning } from './reasoning.js';
import { createFleetGraphQualityReportDraft } from './report.js';
import { prepareFleetGraphRun } from './runner.js';
import { fleetGraphTraceConfig } from './tracing.js';

export interface FleetGraphWorkspaceScanOptions {
  createDraftReports?: boolean;
}

export interface FleetGraphWorkspaceScanProjectResult {
  documentId: string;
  title: string;
  qualityStatus: FleetGraphQualityStatus;
  qualityScore: number;
  remediationCount: number;
  mode: 'deterministic' | 'gpt-4o';
  model: string | null;
  qualityReportId: string | null;
}

export interface FleetGraphWorkspaceScanResult {
  workspaceId: string;
  scannedAt: string;
  source: 'nightly_scan';
  totalProjects: number;
  greenProjects: number;
  yellowProjects: number;
  redProjects: number;
  projects: FleetGraphWorkspaceScanProjectResult[];
}

export async function runFleetGraphWorkspaceScan(
  client: FleetGraphShipApiClient,
  workspaceId: string,
  options: FleetGraphWorkspaceScanOptions = {}
): Promise<FleetGraphWorkspaceScanResult> {
  return tracedRunFleetGraphWorkspaceScan(client, workspaceId, options);
}

const tracedRunFleetGraphWorkspaceScan = traceable(
  async function runWorkspaceScan(
    client: FleetGraphShipApiClient,
    workspaceId: string,
    options: FleetGraphWorkspaceScanOptions
  ): Promise<FleetGraphWorkspaceScanResult> {
    const projects = await client.listDocuments({ type: 'project' });
    const results: FleetGraphWorkspaceScanProjectResult[] = [];

    for (const project of projects) {
      const prepared = await prepareFleetGraphRun(client, {
        workspaceId,
        documentId: project.id,
        source: 'nightly_scan',
      });
      const analysis = await analyzeFleetGraphWithReasoning(prepared.scoringPayload);
      await persistFleetGraphAnalysis(client, analysis);
      const existingReportId = extractExistingReportId(prepared.context.rootDocument.properties);
      let qualityReportId: string | null = existingReportId;

      const rootAnalysis =
        analysis.documents.find((document) => document.documentId === project.id) ??
        analysis.documents[0];

      if (!rootAnalysis) {
        continue;
      }

      if (
        options.createDraftReports &&
        rootAnalysis.qualityStatus !== 'green' &&
        !existingReportId
      ) {
        const report = await createFleetGraphQualityReportDraft(client, prepared, analysis);
        qualityReportId = report.reportId;

        for (const document of analysis.documents) {
          await client.updateDocumentMetadata(document.documentId, {
            ...document.metadata,
            quality_report_id: report.reportId,
          });
        }
      }

      results.push({
        documentId: project.id,
        title: project.title,
        qualityStatus: rootAnalysis.qualityStatus,
        qualityScore: rootAnalysis.qualityScore,
        remediationCount: analysis.remediationSuggestions.filter(
          (suggestion) => !suggestion.document_id || suggestion.document_id === project.id
        ).length,
        mode: analysis.mode,
        model: analysis.model,
        qualityReportId,
      });
    }

    return {
      workspaceId,
      scannedAt: new Date().toISOString(),
      source: 'nightly_scan',
      totalProjects: results.length,
      greenProjects: results.filter((project) => project.qualityStatus === 'green').length,
      yellowProjects: results.filter((project) => project.qualityStatus === 'yellow').length,
      redProjects: results.filter((project) => project.qualityStatus === 'red').length,
      projects: results,
    };
  },
  fleetGraphTraceConfig('fleetgraph.workspace_scan')
);

function extractExistingReportId(properties: Record<string, unknown>): string | null {
  return typeof properties.quality_report_id === 'string' ? properties.quality_report_id : null;
}
