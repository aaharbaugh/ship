import { traceable } from 'langsmith/traceable';
import { analyzeFleetGraphPayload, type FleetGraphDeterministicAnalysis } from './analyze.js';
import { createFleetGraphBearerClient } from './client.js';
import { persistFleetGraphAnalysis } from './persist.js';
import { prepareFleetGraphRun, type FleetGraphPreparedRun } from './runner.js';
import { fleetGraphTraceConfig } from './tracing.js';
import type { FleetGraphTriggerEvent } from './triggers.js';

export interface FleetGraphExecutionResult {
  executed: boolean;
  reason?: 'missing_config';
  prepared?: FleetGraphPreparedRun;
  analysis?: FleetGraphDeterministicAnalysis;
}

export async function executeFleetGraphTrigger(
  event: FleetGraphTriggerEvent
): Promise<FleetGraphExecutionResult> {
  return tracedExecuteFleetGraphTrigger(event);
}

const tracedExecuteFleetGraphTrigger = traceable(
  async function executeTrigger(
    event: FleetGraphTriggerEvent
  ): Promise<FleetGraphExecutionResult> {
    const baseUrl = process.env.INTERNAL_API_URL || process.env.SHIP_API_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`;
    const apiToken = process.env.SHIP_API_TOKEN;

    if (!apiToken) {
      console.info('[FleetGraph] Execution skipped', {
        workspaceId: event.workspaceId,
        documentId: event.documentId,
        source: event.source,
        reason: 'missing_config',
        missing: 'SHIP_API_TOKEN',
      });
      return { executed: false, reason: 'missing_config' };
    }

    const client = createFleetGraphBearerClient(baseUrl, apiToken);
    const prepared = await prepareFleetGraphRun(client, {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
    });
    const analysis = analyzeFleetGraphPayload(prepared.scoringPayload);
    await persistFleetGraphAnalysis(client, analysis);

    console.info('[FleetGraph] Execution complete', {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      documents: analysis.documents.length,
      suggestions: analysis.remediationSuggestions.length,
    });

    return {
      executed: true,
      prepared,
      analysis,
    };
  },
  fleetGraphTraceConfig('fleetgraph.execute_trigger')
);
