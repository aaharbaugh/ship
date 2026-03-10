import fs from 'fs';

const src = process.argv[2] || 'audit/artifacts/query-profile.jsonl';
const dest = process.argv[3] || 'audit/artifacts/query-profile-summary.json';

const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/).filter(Boolean);
const records = lines.map((line) => JSON.parse(line));

const byFlow = new Map();

for (const record of records) {
  if (record.type !== 'request-summary') continue;
  if (!byFlow.has(record.flow)) {
    byFlow.set(record.flow, {
      flow: record.flow,
      requests: [],
      totalQueries: 0,
      slowestQuery: null,
      repeatedAcrossFlow: new Map(),
    });
  }
  const flow = byFlow.get(record.flow);
  flow.requests.push(record);
  flow.totalQueries += record.totalQueries;

  if (!flow.slowestQuery || (record.slowestQuery && record.slowestQuery.ms > flow.slowestQuery.ms)) {
    flow.slowestQuery = record.slowestQuery;
  }

  for (const query of record.queries) {
    flow.repeatedAcrossFlow.set(query.text, (flow.repeatedAcrossFlow.get(query.text) || 0) + 1);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  flows: [...byFlow.values()].map((flow) => ({
    flow: flow.flow,
    requestCount: flow.requests.length,
    requests: flow.requests.map((r) => ({
      method: r.method,
      url: r.url,
      statusCode: r.statusCode,
      totalQueries: r.totalQueries,
      slowestQueryMs: r.slowestQuery?.ms ?? 0,
    })),
    totalQueries: flow.totalQueries,
    slowestQuery: flow.slowestQuery,
    repeatedAcrossFlow: [...flow.repeatedAcrossFlow.entries()]
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count })),
  })),
};

fs.writeFileSync(dest, JSON.stringify(summary, null, 2));
console.log(dest);
