#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export PORT="${PORT:-3002}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173}"
export SESSION_SECRET="${SESSION_SECRET:-audit-secret}"
export E2E_TEST=1
export BENCHMARK_MODE=1

cd "$ROOT_DIR"
pnpm --filter @ship/api dev
