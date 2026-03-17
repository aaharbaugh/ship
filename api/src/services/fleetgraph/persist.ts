import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphDeterministicAnalysis } from './analyze.js';
import { traceable } from 'langsmith/traceable';
import { fleetGraphTraceConfig } from './tracing.js';

export async function persistFleetGraphAnalysis(
  client: FleetGraphShipApiClient,
  analysis: FleetGraphDeterministicAnalysis
): Promise<void> {
  return tracedPersistFleetGraphAnalysis(client, analysis);
}

const tracedPersistFleetGraphAnalysis = traceable(
  async function persistAnalysis(
    client: FleetGraphShipApiClient,
    analysis: FleetGraphDeterministicAnalysis
  ): Promise<void> {
  for (const document of analysis.documents) {
    await client.updateDocumentMetadata(document.documentId, document.metadata);
  }
  },
  fleetGraphTraceConfig('fleetgraph.persist_analysis')
);
