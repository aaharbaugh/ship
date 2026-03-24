import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphAnalysis } from './analyze.js';
import { traceable } from 'langsmith/traceable';
import { fleetGraphTraceConfig } from './tracing.js';

export async function persistFleetGraphAnalysis(
  client: FleetGraphShipApiClient,
  analysis: FleetGraphAnalysis
): Promise<void> {
  return tracedPersistFleetGraphAnalysis(client, analysis);
}

const tracedPersistFleetGraphAnalysis = traceable(
  async function persistAnalysis(
    client: FleetGraphShipApiClient,
    analysis: FleetGraphAnalysis
  ): Promise<void> {
    for (const document of analysis.documents) {
      await client.updateDocumentMetadata(document.documentId, document.metadata);
    }
  },
  fleetGraphTraceConfig('fleetgraph.node.persist_metadata', {
    processInputs: (inputs) => {
      const [, analysis] =
        'args' in inputs ? (inputs.args as [FleetGraphShipApiClient, FleetGraphAnalysis]) : [];
      if (!analysis) {
        return {};
      }

      return {
        rootDocumentId: analysis.rootDocumentId,
        mode: analysis.mode,
        documentCount: analysis.documents.length,
        suggestionCount: analysis.remediationSuggestions.length,
      };
    },
    processOutputs: () => ({
      persisted: true,
    }),
  })
);
