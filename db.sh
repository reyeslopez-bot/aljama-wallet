#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-up}"

RUNTIME="${CONTAINER_RUNTIME:-}"
if [ -n "$RUNTIME" ]; then
  command -v "$RUNTIME" >/dev/null
else
  if command -v podman >/dev/null 2>&1; then
    RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then
    RUNTIME=docker
  else
    echo "Install podman or docker"
    exit 1
  fi
fi

if [ "$RUNTIME" = "podman" ]; then
  if ! podman info >/dev/null 2>&1; then
    if podman machine list >/dev/null 2>&1; then
      echo "Podman not running; starting podman machine..."
      podman machine start
    fi
  fi
  if ! podman info >/dev/null 2>&1; then
    echo "Cannot connect to Podman. Try: podman machine start"
    exit 1
  fi
fi

PG_CONTAINER="${PG_CONTAINER:-aljama-postgres}"
CRDB_CONTAINER="${CRDB_CONTAINER:-aljama-cockroach}"
PG_PORT="${PG_PORT:-5432}"
CRDB_PORT="${CRDB_PORT:-26257}"
CRDB_HTTP_PORT="${CRDB_HTTP_PORT:-8080}"
PG_IMAGE="${PG_IMAGE:-docker.io/library/postgres:16}"
CRDB_IMAGE="${CRDB_IMAGE:-docker.io/cockroachdb/cockroach:v24.1.3}"
PG_DATA_VOL="${PG_DATA_VOL:-aljama_pg_data}"
CRDB_DATA_VOL="${CRDB_DATA_VOL:-aljama_crdb_data}"
PG_DB="${PG_DB:-aljama_wallet}"
PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"

container_exists() {
  "$RUNTIME" ps -a --format '{{.Names}}' | grep -qx "$1"
}

start_postgres() {
  if container_exists "$PG_CONTAINER"; then
    "$RUNTIME" start "$PG_CONTAINER" >/dev/null
    return
  fi

  "$RUNTIME" run -d \
    --name "$PG_CONTAINER" \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e POSTGRES_DB="$PG_DB" \
    -p "0.0.0.0:${PG_PORT}:5432" \
    -v "${PG_DATA_VOL}:/var/lib/postgresql/data" \
    "$PG_IMAGE" >/dev/null
}

start_cockroach() {
  if container_exists "$CRDB_CONTAINER"; then
    "$RUNTIME" start "$CRDB_CONTAINER" >/dev/null
    return
  fi

  "$RUNTIME" run -d \
    --name "$CRDB_CONTAINER" \
    -p "0.0.0.0:${CRDB_PORT}:26257" \
    -p "0.0.0.0:${CRDB_HTTP_PORT}:8080" \
    -v "${CRDB_DATA_VOL}:/cockroach/cockroach-data" \
    "$CRDB_IMAGE" \
    start-single-node --insecure --http-addr="0.0.0.0:${CRDB_HTTP_PORT}" \
    --store=/cockroach/cockroach-data >/dev/null
}

ensure_cockroach_db() {
  local attempts=20
  local i
  for i in $(seq 1 "$attempts"); do
    if "$RUNTIME" exec "$CRDB_CONTAINER" cockroach sql --insecure --host=localhost -e "SELECT 1" >/dev/null 2>&1; then
      "$RUNTIME" exec "$CRDB_CONTAINER" cockroach sql --insecure --host=localhost \
        -e "CREATE DATABASE IF NOT EXISTS ${PG_DB};" >/dev/null
      return
    fi
    sleep 0.5
  done
  echo "CockroachDB did not become ready in time."
  return 1
}

case "$ACTION" in
  up)
    start_postgres
    start_cockroach
    ensure_cockroach_db
    echo "Databases running: $PG_CONTAINER (PG) + $CRDB_CONTAINER (CRDB)"
    ;;
  down)
    "$RUNTIME" stop "$PG_CONTAINER" "$CRDB_CONTAINER" >/dev/null 2>&1 || true
    echo "Databases stopped."
    ;;
  status)
    "$RUNTIME" ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
      | grep -E "(^|\\s)(${PG_CONTAINER}|${CRDB_CONTAINER})(\\s|$)" || true
    ;;
  logs)
    echo "Tailing logs (Ctrl+C to stop)..."
    "$RUNTIME" logs -f "$PG_CONTAINER" &
    PG_LOG_PID=$!
    "$RUNTIME" logs -f "$CRDB_CONTAINER" &
    CRDB_LOG_PID=$!
    wait "$PG_LOG_PID" "$CRDB_LOG_PID"
    ;;
  *)
    echo "Usage: $0 {up|down|status|logs}"
    exit 1
    ;;
esac
