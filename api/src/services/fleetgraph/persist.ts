import type { FleetGraphShipApiClient } from './client.js';
import type { FleetGraphDeterministicAnalysis } from './analyze.js';

export async function persistFleetGraphAnalysis(
  client: FleetGraphShipApiClient,
  analysis: FleetGraphDeterministicAnalysis
): Promise<void> {
  for (const document of analysis.documents) {
    await client.updateDocumentMetadata(document.documentId, document.metadata);
  }
}
