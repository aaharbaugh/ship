import type { TraceableConfig } from 'langsmith/traceable';

const DEFAULT_PROJECT = process.env.LANGSMITH_PROJECT || 'fleetgraph-dev';

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
