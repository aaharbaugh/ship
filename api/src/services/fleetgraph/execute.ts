import { traceable } from 'langsmith/traceable';
import type { FleetGraphAnalysis } from './analyze.js';
import { createFleetGraphBearerClient } from './client.js';
import { persistFleetGraphAnalysis } from './persist.js';
import { analyzeFleetGraphForPurpose } from './reasoning.js';
import { prepareFleetGraphRun, type FleetGraphPreparedRun } from './runner.js';
import { fleetGraphTraceConfig, withFleetGraphTraceAnalysis } from './tracing.js';
import type { FleetGraphTriggerEvent } from './triggers.js';

export interface FleetGraphExecutionResult {
  executed: boolean;
  reason?: 'missing_config';
  prepared?: FleetGraphPreparedRun;
  analysis?: FleetGraphAnalysis;
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
    const analysis = await analyzeFleetGraphForPurpose(prepared.scoringPayload, {
      triggerSource: event.source,
      purpose: 'execute_trigger',
    });
    await persistFleetGraphAnalysis(client, analysis);

    console.info('[FleetGraph] Execution complete', {
      workspaceId: event.workspaceId,
      documentId: event.documentId,
      source: event.source,
      mode: analysis.mode,
      model: analysis.model,
      documents: analysis.documents.length,
      suggestions: analysis.remediationSuggestions.length,
      actualPath: prepared.trace
        ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'execute_trigger').path
        : null,
      nextPath: prepared.trace
        ? withFleetGraphTraceAnalysis(prepared.trace, analysis, 'execute_trigger').nextPath
        : null,
    });

    return {
      executed: true,
      prepared,
      analysis,
    };
  },
  fleetGraphTraceConfig('fleetgraph.run.execute_trigger', {
    processInputs: (inputs) => {
      const [event] = 'args' in inputs ? (inputs.args as [FleetGraphTriggerEvent]) : [];
      if (!event) {
        return {};
      }

      return {
        workspaceId: event.workspaceId,
        documentId: event.documentId,
        triggerSource: event.source,
      };
    },
    processOutputs: (outputs) => {
      const result = 'executed' in outputs ? (outputs as FleetGraphExecutionResult) : null;
      if (!result) {
        return {};
      }

      return {
        executed: result.executed,
        reason: result.reason ?? null,
        rootDocumentId: result.prepared?.rootDocumentId ?? null,
        mode: result.analysis?.mode ?? null,
        model: result.analysis?.model ?? null,
      };
    },
  })
);
