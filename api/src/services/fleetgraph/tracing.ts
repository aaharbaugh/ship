import type { TraceableConfig } from 'langsmith/traceable';

const DEFAULT_PROJECT = process.env.LANGSMITH_PROJECT || 'fleetgraph-dev';
let hasLoggedFleetGraphTracingStatus = false;

export function fleetGraphTraceConfig<Func extends (...args: any[]) => any>(
  name: string,
  extra?: Partial<TraceableConfig<Func>>
): TraceableConfig<Func> {
  return {
    name,
    project_name: DEFAULT_PROJECT,
    tags: ['fleetgraph'],
    ...extra,
  };
}

export function fleetGraphTraceMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  return {
    component: 'fleetgraph',
    ...Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined)
    ),
  };
}

export function isFleetGraphLangSmithEnabled(): boolean {
  const tracingFlag =
    process.env.LANGSMITH_TRACING ??
    process.env.LANGCHAIN_TRACING_V2;

  return Boolean(
    process.env.LANGSMITH_API_KEY &&
      tracingFlag &&
      tracingFlag !== 'false' &&
      tracingFlag !== '0'
  );
}

export function logFleetGraphTracingStatus(): void {
  if (hasLoggedFleetGraphTracingStatus) {
    return;
  }

  hasLoggedFleetGraphTracingStatus = true;
  console.info('[FleetGraph] LangSmith tracing', {
    enabled: isFleetGraphLangSmithEnabled(),
    project: DEFAULT_PROJECT,
    hasApiKey: Boolean(process.env.LANGSMITH_API_KEY),
    tracingFlag:
      process.env.LANGSMITH_TRACING ??
      process.env.LANGCHAIN_TRACING_V2 ??
      null,
  });
}
