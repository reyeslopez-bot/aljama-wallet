#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/container-common.sh
source "$SCRIPT_DIR/scripts/lib/container-common.sh"

IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
RUNTIME="${CONTAINER_RUNTIME:-}"

PNPM_STORE_VOL="${PNPM_STORE_VOL:-aljama_pnpm_store}"
NODE_MODULES_VOL="${NODE_MODULES_VOL:-aljama_node_modules}"
NEXT_CACHE_VOL="${NEXT_CACHE_VOL:-aljama_next_cache}"

PNPM_VERSION="${PNPM_VERSION:-10.28.1}"
DEPS_HASH_FILES=("package.json" "pnpm-lock.yaml" "pnpm-workspace.yaml" ".devcontainer/Containerfile" ".npmrc" ".env")
PRISMA_HASH_FILES=("prisma/crdb/schema.prisma" "prisma/crdb/prisma.config.ts" "prisma/pg/schema.prisma" "prisma/pg/prisma.config.ts")
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
DEPS_INSTALL_HASH_FILE=".devcontainer/.last-installed-deps-hash"
PRISMA_GENERATE_HASH_FILE=".devcontainer/.last-prisma-generate-hash"

MODE="start"
SHELL_ONLY=false
TAIL_LOGS=false
DETACH=true

usage() {
  cat <<'EOF'
Usage: ./dev.sh [options]

Options:
  --attach         Run the dev container in the foreground.
  --clean          Remove the dev container, image, volumes, and local cache, then exit.
  --detach         Run the dev container in the background (default).
  --force-clean    Remove existing runtime artifacts before rebuilding/running.
  --logs           Tail logs after starting the dev container in detached mode.
  --logs-only      Tail logs from the running dev container and exit.
  --port <number>  Set the application port.
  --rebuild        Rebuild the dev image before starting.
  --shell          Reuse or start the dev container, then open an interactive shell.
  --status         Show the running dev container status.
  --stop           Stop and remove the dev container.
  -h, --help       Show this help text.
EOF
}

hash_existing_files() {
  local file
  local inputs=()

  for file in "$@"; do
    [ -f "$file" ] && inputs+=("$file")
  done

  if [ "${#inputs[@]}" -eq 0 ]; then
    printf 'no-input-files\n' | sha256sum | cut -d' ' -f1
    return 0
  fi

  sha256sum "${inputs[@]}" 2>/dev/null | sha256sum | cut -d' ' -f1
}

set_mode() {
  local next_mode="$1"

  if [ "$MODE" != "start" ] && [ "$MODE" != "$next_mode" ]; then
    fail "Choose only one of --stop, --status, --clean, or --logs-only"
  fi

  MODE="$next_mode"
}

clean_runtime_artifacts() {
  remove_container_if_exists "$RUNTIME" "$CONTAINER_NAME"
  "$RUNTIME" rmi -f "$IMAGE_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" volume rm -f "$PNPM_STORE_VOL" "$NODE_MODULES_VOL" "$NEXT_CACHE_VOL" >/dev/null 2>&1 || true
}

clean_local_artifacts() {
  rm -rf .pnpm-store
  rm -f "$DEP_HASH_FILE" "$DEPS_INSTALL_HASH_FILE" "$PRISMA_GENERATE_HASH_FILE"
}

while (($#)); do
  case $1 in
    --force-clean) FORCE_CLEAN=true; shift ;;
    --rebuild) REBUILD=true; shift ;;
    --stop) set_mode "stop"; shift ;;
    --status) set_mode "status"; shift ;;
    --clean) set_mode "clean"; shift ;;
    --shell) SHELL_ONLY=true; shift ;;
    --logs) TAIL_LOGS=true; shift ;;
    --logs-only) set_mode "logs"; shift ;;
    --attach) DETACH=false; shift ;;
    --detach) DETACH=true; shift ;;
    --port) APP_PORT="${2:?}"; shift 2 ;;
    --port=*) APP_PORT="${1#*=}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

if [ "$MODE" != "start" ] && [ "$SHELL_ONLY" = true ]; then
  fail "--shell can only be used when starting the dev container"
fi

if [ "$MODE" != "start" ] && [ "$TAIL_LOGS" = true ]; then
  fail "--logs can only be used when starting the dev container"
fi

validate_port "$APP_PORT"
load_env_exports true ".env" ".env.local"
DEV_NEXTAUTH_SECRET="${NEXTAUTH_DEV_SECRET:-aljama-dev-nextauth-secret}"

if [ -z "$APP_URL" ]; then
  APP_URL="http://localhost:$APP_PORT"
fi

RUNTIME="$(detect_container_runtime "$RUNTIME")"

case "$MODE" in
  stop)
    remove_container_if_exists "$RUNTIME" "$CONTAINER_NAME"
    exit 0
    ;;
  clean)
    clean_runtime_artifacts
    clean_local_artifacts
    exit 0
    ;;
  status)
    ensure_runtime_ready "$RUNTIME"
    show_running_container_status "$RUNTIME" "$CONTAINER_NAME"
    exit 0
    ;;
  logs)
    ensure_runtime_ready "$RUNTIME"
    if ! container_running "$RUNTIME" "$CONTAINER_NAME"; then
      fail "Container '$CONTAINER_NAME' is not running."
    fi
    tail_container_logs "$RUNTIME" "$CONTAINER_NAME"
    ;;
esac

echo "pnpm version pin: ${PNPM_VERSION:-unset}"
ensure_runtime_ready "$RUNTIME"

if [ "$SHELL_ONLY" = true ] && [ "$REBUILD" = false ] && [ "$FORCE_CLEAN" = false ]; then
  if container_running "$RUNTIME" "$CONTAINER_NAME"; then
    exec_container_shell "$RUNTIME" "$CONTAINER_NAME"
  fi
fi

mkdir -p .devcontainer
CURRENT_HASH="$(hash_existing_files "${DEPS_HASH_FILES[@]}")"
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"
CURRENT_PRISMA_HASH="$(hash_existing_files "${PRISMA_HASH_FILES[@]}")"

if [ "$FORCE_CLEAN" = true ]; then
  REBUILD=true
elif [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
  REBUILD=true
fi

if [ "$FORCE_CLEAN" = true ]; then
  clean_runtime_artifacts
  clean_local_artifacts
fi

if [ "$REBUILD" = true ]; then
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target dev \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"
  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
fi

if container_running "$RUNTIME" "$CONTAINER_NAME"; then
  remove_container_if_exists "$RUNTIME" "$CONTAINER_NAME"
fi

RUN_EXTRA_ARGS=()
WORKDIR_MOUNT="$PWD:/workspace"
if [ "$RUNTIME" = "podman" ]; then
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  RUN_EXTRA_ARGS+=(--add-host=host.containers.internal:host-gateway)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
else
  RUN_EXTRA_ARGS+=(--user "$(id -u):$(id -g)")
fi

ENV_FILE_ARGS=()
append_env_file_args ENV_FILE_ARGS "$PWD/.env" "$PWD/.env.local"

DB_ENV_ARGS=()
DB_HOST_ALIAS="$(host_alias_for_runtime "$RUNTIME")"
append_localhost_env_overrides \
  DB_ENV_ARGS \
  "$DB_HOST_ALIAS" \
  "PG_DATABASE_URL" \
  "CRDB_DATABASE_URL" \
  "POSTGRES_URL" \
  "COCKROACH_URL"

PORT_PUBLISH="127.0.0.1:${APP_PORT}:${APP_PORT}"
RUN_MODE_ARGS=()
if [ "$SHELL_ONLY" = true ]; then
  DETACH=true
fi

if [ "$DETACH" = true ]; then
  RUN_MODE_ARGS+=(-d)
else
  RUN_MODE_ARGS+=(-it)
fi

RUN_CMD=("$RUNTIME" run "--rm")
RUN_CMD+=("${RUN_MODE_ARGS[@]}")
RUN_CMD+=("--name" "$CONTAINER_NAME")
if [ "${#ENV_FILE_ARGS[@]}" -gt 0 ]; then
  RUN_CMD+=("${ENV_FILE_ARGS[@]}")
fi
if [ "${#DB_ENV_ARGS[@]}" -gt 0 ]; then
  RUN_CMD+=("${DB_ENV_ARGS[@]}")
fi
RUN_CMD+=(
  -p "$PORT_PUBLISH"
  -e "AUTH_MODE=${AUTH_MODE:-memory}"
  -e "NEXTAUTH_URL=${NEXTAUTH_URL:-http://localhost:${APP_PORT}}"
  -e "NEXTAUTH_DEV_SECRET=${DEV_NEXTAUTH_SECRET}"
  -e "PORT=$APP_PORT"
  -e "PNPM_VERSION=$PNPM_VERSION"
  -e "PNPM_STORE_DIR=/workspace/.pnpm-store"
  -e "ALJAMA_DEPS_HASH=$CURRENT_HASH"
  -e "ALJAMA_DEPS_MARKER_FILE=/workspace/${DEPS_INSTALL_HASH_FILE}"
  -e "ALJAMA_PRISMA_HASH=$CURRENT_PRISMA_HASH"
  -e "ALJAMA_PRISMA_MARKER_FILE=/workspace/${PRISMA_GENERATE_HASH_FILE}"
  -v "$WORKDIR_MOUNT"
  --volume "${PNPM_STORE_VOL}:/workspace/.pnpm-store"
  --volume "${NODE_MODULES_VOL}:/workspace/node_modules"
  --volume "${NEXT_CACHE_VOL}:/workspace/.next"
)
RUN_CMD+=("${RUN_EXTRA_ARGS[@]}")
RUN_CMD+=("$IMAGE_NAME" bash /workspace/scripts/dev-bootstrap.sh)

"${RUN_CMD[@]}"

echo "Container: $CONTAINER_NAME"
echo "App: $APP_URL"

if [ "$SHELL_ONLY" = true ]; then
  exec_container_shell "$RUNTIME" "$CONTAINER_NAME"
fi

if [ "$TAIL_LOGS" = true ] && [ "$DETACH" = true ]; then
  tail_container_logs "$RUNTIME" "$CONTAINER_NAME"
fi
