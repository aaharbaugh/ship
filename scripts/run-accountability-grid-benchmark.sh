#!/usr/bin/env bash

set -euo pipefail

API_BASE_URL="${BENCHMARK_API_URL:-http://localhost:3002}"
BENCHMARK_URL="${API_BASE_URL}/api/team/accountability-grid-v3?fromSprint=1&toSprint=10"
COOKIE_FILE="/tmp/ship-cookie-header.txt"
CONNECTIONS="${BENCHMARK_CONNECTIONS:-50}"
DURATION="${BENCHMARK_DURATION:-20}"

if [ ! -f "$COOKIE_FILE" ]; then
  echo "Missing $COOKIE_FILE. Run: node scripts/login-benchmark-session.js"
  exit 1
fi

COOKIE_HEADER="$(cat "$COOKIE_FILE")"

npx autocannon \
  -c "$CONNECTIONS" \
  -d "$DURATION" \
  -H "Cookie: $COOKIE_HEADER" \
  "$BENCHMARK_URL" \
  "$@"
