#!/usr/bin/env bash

set -euo pipefail

pnpm --filter @ship/api exec tsx scripts/explain-issues-belongs-to-query.ts "$@"
