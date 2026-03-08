#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"
DEPS_HASH="${ALJAMA_DEPS_HASH:-}"
DEPS_MARKER_FILE="${ALJAMA_DEPS_MARKER_FILE:-$WORKSPACE_DIR/.devcontainer/.last-installed-deps-hash}"
PRISMA_HASH="${ALJAMA_PRISMA_HASH:-}"
PRISMA_MARKER_FILE="${ALJAMA_PRISMA_MARKER_FILE:-$WORKSPACE_DIR/.devcontainer/.last-prisma-generate-hash}"
PNPM_STORE_DIR="${PNPM_STORE_DIR:-$WORKSPACE_DIR/.pnpm-store}"

cd "$WORKSPACE_DIR"
mkdir -p "$(dirname "$DEPS_MARKER_FILE")" "$(dirname "$PRISMA_MARKER_FILE")"

pnpm config set store-dir "$PNPM_STORE_DIR"

deps_changed=false
deps_marker="$(cat "$DEPS_MARKER_FILE" 2>/dev/null || true)"
if [ ! -f node_modules/.modules.yaml ] || [ -z "$DEPS_HASH" ] || [ "$deps_marker" != "$DEPS_HASH" ]; then
  pnpm install --prefer-offline
  printf '%s\n' "$DEPS_HASH" >"$DEPS_MARKER_FILE"
  deps_changed=true
fi

prisma_marker="$(cat "$PRISMA_MARKER_FILE" 2>/dev/null || true)"
if [ "$deps_changed" = true ] || [ ! -f prisma/generated/pg/index.d.ts ] || [ ! -f prisma/generated/prisma-crdb/index.d.ts ] || [ -z "$PRISMA_HASH" ] || [ "$prisma_marker" != "$PRISMA_HASH" ]; then
  pnpm prisma:generate
  printf '%s\n' "$PRISMA_HASH" >"$PRISMA_MARKER_FILE"
fi

exec pnpm dev --port "${PORT:?PORT is required}" --hostname 0.0.0.0
