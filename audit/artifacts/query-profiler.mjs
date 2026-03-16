import fs from 'fs';
import path from 'path';
import http from 'http';
import { AsyncLocalStorage } from 'async_hooks';
import { createRequire } from 'module';

const require = createRequire('/home/aaron/projects/gauntlet/ship/ship/api/package.json');
const pg = require('pg');
const { Pool, Client } = pg;

const als = new AsyncLocalStorage();
const outPath = path.resolve(process.cwd(), '../audit/artifacts/query-profile.jsonl');

function appendRecord(record) {
  fs.appendFileSync(outPath, JSON.stringify(record) + '\n');
}

function normalizeQueryText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

function getQueryParts(args) {
  const [first, second] = args;
  if (typeof first === 'string') {
    return { text: first, values: Array.isArray(second) ? second : [] };
  }
  if (first && typeof first === 'object') {
    return {
      text: first.text || '',
      values: Array.isArray(first.values) ? first.values : [],
    };
  }
  return { text: '', values: [] };
}

function patchQuery(Proto) {
  const original = Proto.prototype.query;
  Proto.prototype.query = function patchedQuery(...args) {
    const ctx = als.getStore();
    const start = process.hrtime.bigint();
    const { text, values } = getQueryParts(args);

    const done = (status, error) => {
      if (!ctx) return;
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      ctx.queries.push({
        text: normalizeQueryText(text),
        values,
        ms: Number(ms.toFixed(3)),
        status,
        error: error ? String(error.message || error) : undefined,
      });
    };

    try {
      const result = original.apply(this, args);
      if (result && typeof result.then === 'function') {
        return result.then(
          (value) => {
            done('ok');
            return value;
          },
          (error) => {
            done('error', error);
            throw error;
          }
        );
      }
      done('ok');
      return result;
    } catch (error) {
      done('error', error);
      throw error;
    }
  };
}

patchQuery(Pool);
patchQuery(Client);

const originalEmit = http.Server.prototype.emit;
http.Server.prototype.emit = function patchedEmit(event, req, res) {
  if (event !== 'request' || !req || !res) {
    return originalEmit.apply(this, arguments);
  }

  const ctx = {
    flow: req.headers['x-audit-flow'] || 'unlabeled',
    method: req.method,
    url: req.url,
    startedAt: Date.now(),
    queries: [],
  };

  return als.run(ctx, () => {
    res.on('finish', () => {
      const repeated = new Map();
      let slowest = null;

      for (const query of ctx.queries) {
        repeated.set(query.text, (repeated.get(query.text) || 0) + 1);
        if (!slowest || query.ms > slowest.ms) {
          slowest = query;
        }
      }

      appendRecord({
        type: 'request-summary',
        flow: ctx.flow,
        method: ctx.method,
        url: ctx.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - ctx.startedAt,
        totalQueries: ctx.queries.length,
        repeatedQueries: [...repeated.entries()]
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1])
          .map(([text, count]) => ({ text, count })),
        slowestQuery: slowest,
        queries: ctx.queries,
      });
    });

    return originalEmit.apply(this, arguments);
  });
};
