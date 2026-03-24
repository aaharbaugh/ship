import { createHash } from 'crypto';

const FLEETGRAPH_PROPERTY_KEYS = new Set([
  'quality_score',
  'quality_status',
  'quality_summary',
  'quality_tags',
  'last_scored_at',
  'quality_report_id',
  'quality_summary_hash',
  'fleetgraph_version',
]);

export interface FleetGraphHashInput {
  title?: string | null;
  content?: unknown;
  properties?: Record<string, unknown> | null;
  parentId?: string | null;
  belongsTo?: Array<{ id: string; type: string }> | null;
}

export function computeFleetGraphContentHash(input: FleetGraphHashInput): string {
  const normalized = {
    title: input.title ?? null,
    content: input.content ?? null,
    properties: stripFleetGraphProperties(input.properties ?? {}),
    parentId: input.parentId ?? null,
    belongsTo: (input.belongsTo ?? [])
      .map((association) => ({ id: association.id, type: association.type }))
      .sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)),
  };

  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function stripFleetGraphProperties(properties: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !FLEETGRAPH_PROPERTY_KEYS.has(key))
      .sort(([a], [b]) => a.localeCompare(b))
  );
}
