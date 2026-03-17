import type {
  FleetGraphAlertTag,
  FleetGraphDocumentMetadata,
  FleetGraphRemediationSuggestion,
} from '@ship/shared';
import type { FleetGraphScoringDocument, FleetGraphScoringPayload } from './payload.js';

export interface FleetGraphDocumentAnalysis {
  documentId: string;
  documentType: string;
  qualityScore: number;
  qualityStatus: 'green' | 'yellow' | 'red';
  summary: string;
  tags: FleetGraphAlertTag[];
  metadata: FleetGraphDocumentMetadata;
}

export interface FleetGraphDeterministicAnalysis {
  generatedAt: string;
  rootDocumentId: string;
  remediationSuggestions: FleetGraphRemediationSuggestion[];
  documents: FleetGraphDocumentAnalysis[];
}

export function analyzeFleetGraphPayload(
  payload: FleetGraphScoringPayload
): FleetGraphDeterministicAnalysis {
  const documents = payload.documents.map(analyzeDocument);

  return {
    generatedAt: new Date().toISOString(),
    rootDocumentId: payload.rootDocumentId,
    remediationSuggestions: buildRemediationSuggestions(documents),
    documents,
  };
}

function analyzeDocument(document: FleetGraphScoringDocument): FleetGraphDocumentAnalysis {
  const tags: FleetGraphAlertTag[] = [];
  let score = 1;

  if (!document.hasContent || document.summaryText.trim().length === 0) {
    tags.push(makeTag('missing_content', 'Missing content', 'high'));
    score -= 0.55;
  } else if (document.summaryText.trim().length < 40) {
    tags.push(makeTag('thin_content', 'Thin content', 'medium'));
    score -= 0.2;
  }

  if (!document.ownerId && document.documentType !== 'program') {
    tags.push(makeTag('missing_owner', 'Missing owner', 'medium'));
    score -= 0.15;
  }

  if (document.documentType === 'issue' && !hasAcceptanceCriteria(document)) {
    tags.push(makeTag('missing_acceptance_criteria', 'Missing acceptance criteria', 'high'));
    score -= 0.25;
  }

  if (document.documentType === 'standup' && document.summaryText.trim().length < 30) {
    tags.push(makeTag('low_signal_standup', 'Low-signal standup', 'medium'));
    score -= 0.15;
  }

  const qualityScore = Number(Math.max(0.05, Math.min(1, score)).toFixed(2));
  const qualityStatus = toStatus(qualityScore, tags);
  const summary = buildSummary(document, qualityStatus, tags);

  return {
    documentId: document.id,
    documentType: document.documentType,
    qualityScore,
    qualityStatus,
    summary,
    tags,
    metadata: {
      quality_score: qualityScore,
      quality_status: qualityStatus,
      quality_summary: summary,
      quality_tags: tags,
      last_scored_at: new Date().toISOString(),
      fleetgraph_version: 'deterministic-v1',
    },
  };
}

function hasAcceptanceCriteria(document: FleetGraphScoringDocument): boolean {
  return (
    document.summaryText.toLowerCase().includes('acceptance criteria') ||
    document.tags.some((tag) => tag.toLowerCase().includes('acceptance'))
  );
}

function buildSummary(
  document: FleetGraphScoringDocument,
  qualityStatus: 'green' | 'yellow' | 'red',
  tags: FleetGraphAlertTag[]
): string {
  if (tags.length === 0) {
    return `${document.title} looks coherent for a ${document.documentType} document.`;
  }

  const tagLabels = tags.map((tag) => tag.label.toLowerCase()).join(', ');
  return `${document.title} is ${qualityStatus} because FleetGraph detected ${tagLabels}.`;
}

function buildRemediationSuggestions(
  documents: FleetGraphDocumentAnalysis[]
): FleetGraphRemediationSuggestion[] {
  return documents
    .flatMap((document) =>
      document.tags.map((tag) => ({
        title: `Improve ${document.documentType}: ${tag.label}`,
        priority: tag.severity,
        rationale: document.summary,
        document_id: document.documentId,
      }))
    )
    .slice(0, 10);
}

function makeTag(
  key: string,
  label: string,
  severity: 'high' | 'medium' | 'low'
): FleetGraphAlertTag {
  return { key, label, severity, source: 'deterministic' };
}

function toStatus(
  score: number,
  tags: FleetGraphAlertTag[]
): 'green' | 'yellow' | 'red' {
  if (tagsContainSeverity(tags, 'high')) return 'red';
  if (tagsContainSeverity(tags, 'medium')) return 'yellow';
  if (score >= 0.75) return 'green';
  if (score >= 0.45) return 'yellow';
  return 'red';
}

function tagsContainSeverity(
  tags: FleetGraphAlertTag[] | undefined,
  severity: 'high' | 'medium' | 'low'
): boolean {
  return Array.isArray(tags) && tags.some((tag) => tag.severity === severity);
}
