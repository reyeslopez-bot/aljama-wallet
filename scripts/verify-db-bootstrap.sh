#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PG_URL="${PG_DATABASE_URL:-${POSTGRES_URL:-}}"
CRDB_URL="${CRDB_DATABASE_URL:-${COCKROACH_URL:-}}"

fail() {
  echo "$*" >&2
  exit 1
}

require_url() {
  local label="$1"
  local value="$2"

  if [ -z "$value" ]; then
    fail "Missing ${label}. Set PG_DATABASE_URL/POSTGRES_URL and CRDB_DATABASE_URL/COCKROACH_URL before running this check."
  fi
}

require_url "PG_DATABASE_URL" "$PG_URL"
require_url "CRDB_DATABASE_URL" "$CRDB_URL"

echo "==> PostgreSQL bootstrap: prisma migrate deploy"
PG_DATABASE_URL="$PG_URL" pnpm prisma migrate deploy --config=prisma/pg/prisma.config.ts

echo "==> PostgreSQL drift check: schema matches database after migrate deploy"
PG_DATABASE_URL="$PG_URL" pnpm prisma migrate diff \
  --from-schema prisma/pg/schema.prisma \
  --to-config-datasource \
  --config=prisma/pg/prisma.config.ts \
  --exit-code

echo "==> CockroachDB bootstrap: prisma db push"
CRDB_DATABASE_URL="$CRDB_URL" pnpm prisma db push --config=prisma/crdb/prisma.config.ts

echo "==> CockroachDB drift check: schema matches database"
CRDB_DATABASE_URL="$CRDB_URL" pnpm prisma migrate diff \
  --from-schema prisma/crdb/schema.prisma \
  --to-config-datasource \
  --config=prisma/crdb/prisma.config.ts \
  --exit-code

echo "==> Verifying bootstrap contracts"
PG_DATABASE_URL="$PG_URL" CRDB_DATABASE_URL="$CRDB_URL" node --input-type=module <<'NODE'
import { Client } from 'pg'

async function queryOne(connectionString, sql, label) {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const result = await client.query(sql)
    return result.rows[0] ?? null
  } finally {
    await client.end()
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const pgUrl = process.env.PG_DATABASE_URL
const crdbUrl = process.env.CRDB_DATABASE_URL

const pgTables = await queryOne(
  pgUrl,
  `
  SELECT
    to_regclass('"User"') IS NOT NULL AS has_user,
    to_regclass('"Session"') IS NOT NULL AS has_session,
    to_regclass('"WalletTransferLog"') IS NOT NULL AS has_wallet_transfer_log,
    to_regclass('"SecuritySignalEvent"') IS NOT NULL AS has_security_signal_event,
    to_regclass('"DailyTransactionSummary"') IS NOT NULL AS has_daily_summary,
    (SELECT COUNT(*)::int FROM "_prisma_migrations") AS migration_count
  `,
  'pg tables',
)

const pgColumns = await queryOne(
  pgUrl,
  `
  SELECT
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'email' AND is_nullable = 'YES'
    ) AS user_email_nullable,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'WalletTransferLog' AND column_name = 'traceId'
    ) AS wallet_transfer_log_has_trace_id,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'SecuritySignalEvent' AND column_name = 'schemaVersion'
    ) AS security_signal_event_has_schema_version,
    EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'DailyTransactionSummary' AND column_name = 'count'
    ) AS daily_summary_has_count
  `,
  'pg columns',
)

assert(pgTables?.has_user, 'PostgreSQL bootstrap missing User table')
assert(pgTables?.has_session, 'PostgreSQL bootstrap missing Session table')
assert(pgTables?.has_wallet_transfer_log, 'PostgreSQL bootstrap missing WalletTransferLog table')
assert(pgTables?.has_security_signal_event, 'PostgreSQL bootstrap missing SecuritySignalEvent table')
assert(pgTables?.has_daily_summary, 'PostgreSQL bootstrap missing DailyTransactionSummary table')
assert((pgTables?.migration_count ?? 0) > 0, 'PostgreSQL bootstrap did not record Prisma migrations')
assert(pgColumns?.user_email_nullable, 'PostgreSQL bootstrap did not apply email-nullability migration')
assert(pgColumns?.wallet_transfer_log_has_trace_id, 'PostgreSQL bootstrap missing WalletTransferLog.traceId')
assert(pgColumns?.security_signal_event_has_schema_version, 'PostgreSQL bootstrap missing SecuritySignalEvent.schemaVersion')
assert(pgColumns?.daily_summary_has_count, 'PostgreSQL bootstrap missing DailyTransactionSummary.count')

const crdbTables = await queryOne(
  crdbUrl,
  `
  SELECT
    EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Wallet'
    ) AS has_wallet,
    EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'WalletAddress'
    ) AS has_wallet_address,
    EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ChainTransaction'
    ) AS has_chain_transaction,
    EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'XrplTransaction'
    ) AS has_xrpl_transaction,
    EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
    ) AS has_migrations_table
  `,
  'crdb tables',
)

assert(crdbTables?.has_wallet, 'CockroachDB bootstrap missing Wallet table')
assert(crdbTables?.has_wallet_address, 'CockroachDB bootstrap missing WalletAddress table')
assert(crdbTables?.has_chain_transaction, 'CockroachDB bootstrap missing ChainTransaction table')
assert(crdbTables?.has_xrpl_transaction, 'CockroachDB bootstrap missing XrplTransaction table')
assert(!crdbTables?.has_migrations_table, 'CockroachDB bootstrap unexpectedly created _prisma_migrations')

console.log(
  JSON.stringify(
    {
      ok: true,
      pg: {
        migrationCount: pgTables.migration_count,
      },
      crdb: {
        schemaMode: 'db-push',
      },
    },
    null,
    2,
  ),
)
NODE

echo "Database bootstrap contracts verified."
