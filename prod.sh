#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/container-common.sh
source "$SCRIPT_DIR/scripts/lib/container-common.sh"

IMAGE_NAME="${IMAGE_NAME:-aljama-wallet-prod}"
CONTAINER_NAME="${CONTAINER_NAME:-aljama-prod}"
WORKER_IMAGE_NAME="${WORKER_IMAGE_NAME:-aljama-wallet-worker-prod}"
WORKER_CONTAINER_NAME="${WORKER_CONTAINER_NAME:-aljama-chain-sync-worker}"
APP_PORT="${APP_PORT:-2999}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
APP_URL_ENV="${APP_URL:-}"
APP_URL=""
RUNTIME="${CONTAINER_RUNTIME:-}"
WITH_CHAIN_SYNC_WORKER="${WITH_CHAIN_SYNC_WORKER:-false}"
RESTART_POLICY="${RESTART_POLICY:-unless-stopped}"

load_env_exports false ".env" ".env.local"

while (($#)); do
  case $1 in
    --port) APP_PORT="${2:?}"; shift 2 ;;
    --port=*) APP_PORT="${1#*=}"; shift ;;
    --image-name) IMAGE_NAME="${2:?}"; shift 2 ;;
    --image-name=*) IMAGE_NAME="${1#*=}"; shift ;;
    --container-name) CONTAINER_NAME="${2:?}"; shift 2 ;;
    --container-name=*) CONTAINER_NAME="${1#*=}"; shift ;;
    --build-context) BUILD_CONTEXT="${2:?}"; shift 2 ;;
    --build-context=*) BUILD_CONTEXT="${1#*=}"; shift ;;
    --runtime) RUNTIME="${2:?}"; shift 2 ;;
    --runtime=*) RUNTIME="${1#*=}"; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: ./prod.sh [--port <number>] [--image-name <name>] [--container-name <name>] [--build-context <path>] [--runtime <podman|docker>] [--with-chain-sync-worker]
EOF
      exit 0
      ;;
    --with-chain-sync-worker) WITH_CHAIN_SYNC_WORKER="true"; shift ;;
    --without-chain-sync-worker) WITH_CHAIN_SYNC_WORKER="false"; shift ;;
    --worker-image-name) WORKER_IMAGE_NAME="${2:?}"; shift 2 ;;
    --worker-image-name=*) WORKER_IMAGE_NAME="${1#*=}"; shift ;;
    --worker-container-name) WORKER_CONTAINER_NAME="${2:?}"; shift 2 ;;
    --worker-container-name=*) WORKER_CONTAINER_NAME="${1#*=}"; shift ;;
    --restart-policy) RESTART_POLICY="${2:?}"; shift 2 ;;
    --restart-policy=*) RESTART_POLICY="${1#*=}"; shift ;;
    *) fail "Unknown option: $1" ;;
  esac
done

validate_port "$APP_PORT"

if [ -n "$APP_URL_ENV" ]; then
  APP_URL="$APP_URL_ENV"
else
  APP_URL="http://localhost:$APP_PORT"
fi

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  echo "NEXTAUTH_SECRET is required for production runs."
  echo "Generate one with: openssl rand -base64 32"
  exit 1
fi

RUNTIME="$(detect_container_runtime "$RUNTIME")"
ensure_runtime_ready "$RUNTIME"

DB_ENV_ARGS=()
DB_HOST_ALIAS="$(host_alias_for_runtime "$RUNTIME")"
append_localhost_env_overrides \
  DB_ENV_ARGS \
  "$DB_HOST_ALIAS" \
  "PG_DATABASE_URL" \
  "CRDB_DATABASE_URL" \
  "POSTGRES_URL" \
  "COCKROACH_URL" \
  "EVM_RPC_URL"

VOLUME_SUFFIX=""
if [ "$RUNTIME" = "podman" ]; then
  VOLUME_SUFFIX=":Z"
fi

remove_container_if_exists "$RUNTIME" "$CONTAINER_NAME"
remove_container_if_exists "$RUNTIME" "$WORKER_CONTAINER_NAME"

"$RUNTIME" build \
  -f .devcontainer/Containerfile \
  --target prod \
  -t "$IMAGE_NAME" \
  "$BUILD_CONTEXT"

if [ "$WITH_CHAIN_SYNC_WORKER" = "true" ]; then
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target worker \
    -t "$WORKER_IMAGE_NAME" \
    "$BUILD_CONTEXT"
fi

RUN_CMD=("$RUNTIME" run "-d")
RUN_CMD+=("--name" "$CONTAINER_NAME")
RUN_CMD+=("--restart" "$RESTART_POLICY")
RUN_CMD+=("-p" "$APP_PORT:$APP_PORT")
RUN_CMD+=("-e" "PORT=$APP_PORT")
RUN_CMD+=("-e" "HOSTNAME=0.0.0.0")

ENV_FILE_ARGS=()
append_env_file_args ENV_FILE_ARGS "$PWD/.env" "$PWD/.env.local"
if [ "${#ENV_FILE_ARGS[@]}" -gt 0 ]; then
  RUN_CMD+=("${ENV_FILE_ARGS[@]}")
fi
if [ "${#DB_ENV_ARGS[@]}" -gt 0 ]; then
  RUN_CMD+=("${DB_ENV_ARGS[@]}")
fi

if [ -d ./infra/runtime ]; then
  RUN_CMD+=("-v" "$PWD/infra/runtime:/runtime$VOLUME_SUFFIX")
fi

RUN_CMD+=("$IMAGE_NAME")

"${RUN_CMD[@]}"

if [ "$WITH_CHAIN_SYNC_WORKER" = "true" ]; then
  WORKER_RUN_CMD=("$RUNTIME" run "-d")
  WORKER_RUN_CMD+=("--name" "$WORKER_CONTAINER_NAME")
  WORKER_RUN_CMD+=("--restart" "$RESTART_POLICY")

  if [ "${#ENV_FILE_ARGS[@]}" -gt 0 ]; then
    WORKER_RUN_CMD+=("${ENV_FILE_ARGS[@]}")
  fi
  if [ "${#DB_ENV_ARGS[@]}" -gt 0 ]; then
    WORKER_RUN_CMD+=("${DB_ENV_ARGS[@]}")
  fi

  if [ -d ./infra/runtime ]; then
    WORKER_RUN_CMD+=("-v" "$PWD/infra/runtime:/runtime$VOLUME_SUFFIX")
  fi

  WORKER_RUN_CMD+=("$WORKER_IMAGE_NAME")

  "${WORKER_RUN_CMD[@]}"
fi

echo "Aljama Wallet running at $APP_URL"
