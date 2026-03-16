#!/bin/bash
set -euo pipefail

ENVIRONMENT="${1:-shadow}"

if [[ ! "$ENVIRONMENT" =~ ^(dev|shadow|prod)$ ]]; then
    echo "Usage: $0 [dev|shadow|prod]"
    echo ""
    echo "Examples:"
    echo "  $0           # Seed the public demo (shadow)"
    echo "  $0 shadow    # Seed the public demo (shadow)"
    echo "  $0 dev       # Seed dev deployment"
    echo "  $0 prod      # Seed prod deployment explicitly"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Seeding deployed $ENVIRONMENT environment..."
"$SCRIPT_DIR/init-database.sh" "$ENVIRONMENT" --seed --yes
