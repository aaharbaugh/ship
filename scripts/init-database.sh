#!/bin/bash
set -euo pipefail

usage() {
    cat <<EOF
Usage: $0 [dev|shadow|prod] [--seed] [--yes]

Examples:
  $0
  $0 dev
  $0 shadow --seed --yes
  $0 prod --seed

Options:
  --seed  Seed the target database after applying schema
  --yes   Skip interactive prompts

Notes:
  - Defaults to the dev environment when no environment is provided.
  - For a public demo deployment, prefer: $0 shadow --seed --yes
EOF
}

ENVIRONMENT="dev"
SEED_MODE="prompt"
ASSUME_YES="false"

for arg in "$@"; do
    case "$arg" in
        dev|shadow|prod)
            ENVIRONMENT="$arg"
            ;;
        --seed)
            SEED_MODE="yes"
            ;;
        --yes)
            ASSUME_YES="true"
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $arg"
            echo
            usage
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "Ship - Database Initialization"
echo "=========================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo ""

cd "$(dirname "$0")/.."

SSM_PARAMETER="/ship/${ENVIRONMENT}/DATABASE_URL"
echo "Fetching database connection from SSM Parameter Store..."
DATABASE_URL=$(aws ssm get-parameter --name "$SSM_PARAMETER" --with-decryption --query "Parameter.Value" --output text)

if [ -z "$DATABASE_URL" ]; then
    echo "Error: Could not fetch DATABASE_URL from SSM Parameter Store"
    echo "Missing parameter: $SSM_PARAMETER"
    echo "Make sure infrastructure is deployed and you have AWS credentials configured"
    exit 1
fi

echo "Database URL fetched successfully (credentials hidden)"
echo ""

export DATABASE_URL

echo "Applying database schema..."
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\(.*\):.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\(.*\)$/\1/p')
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\(.*\):.*/\1/p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/.*:\(.*\)@.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/.*@.*:\(.*\)\/.*/\1/p')

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f api/src/db/schema.sql

echo ""
echo "Schema applied successfully!"
echo ""

should_seed="false"
if [ "$SEED_MODE" = "yes" ]; then
    should_seed="true"
elif [ "$ASSUME_YES" = "true" ]; then
    should_seed="false"
elif [ -t 0 ]; then
    read -p "Seed database with demo/test data? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        should_seed="true"
    fi
fi

if [ "$should_seed" = "true" ]; then
    echo "Seeding database..."
    pnpm --filter @ship/api db:seed
    echo "Database seeded successfully!"
else
    echo "Skipping database seed."
fi

echo ""
echo "=========================================="
echo "Database initialization complete!"
echo "=========================================="
