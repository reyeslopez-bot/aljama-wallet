#!/usr/bin/env bash
set -euo pipefail
# Aljama Wallet Development Runner (Podman/Docker) — hardened for Turbopack on macOS

IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
RUNTIME="${CONTAINER_RUNTIME:-}" # podman|docker (auto if empty)

# Volumes
PNPM_STORE_VOL="${PNPM_STORE_VOL:-aljama_pnpm_store}"
NODE_MODULES_VOL="${NODE_MODULES_VOL:-aljama_node_modules}"
NEXT_CACHE_VOL="${NEXT_CACHE_VOL:-aljama_next_cache}"

# Tooling
PNPM_VERSION="${PNPM_VERSION:-10.28.1}"
echo "pnpm version pin: ${PNPM_VERSION:-unset}"

# hash inputs
DEPS_HASH_FILES=("package.json" "pnpm-lock.yaml" "pnpm-workspace.yaml" ".devcontainer/Containerfile" ".npmrc" ".env")
DEP_HASH_FILE=".devcontainer/.last-deps-hash"

STOP_ONLY=false
SHELL_ONLY=false
TAIL_LOGS=false
DETACH=true

# --- Load .env on HOST (for hashing / defaults only) ---
if [ -f .env ]; then
  if grep -qE '^[A-Z0-9_]+=\s+' .env; then
    echo "Invalid .env format: spaces after '='"
    exit 1
  fi
  set -a
  source .env
  set +a
fi

# --- CLI parsing ---
while (($#)); do
  case $1 in
    --force-clean) FORCE_CLEAN=true; shift ;;
    --rebuild)     REBUILD=true; shift ;;
    --stop)        STOP_ONLY=true; shift ;;
    --shell)       SHELL_ONLY=true; shift ;;
    --logs)        TAIL_LOGS=true; shift ;;
    --attach)      DETACH=false; shift ;;
    --detach)      DETACH=true; shift ;;
    --port)        APP_PORT="${2:?}"; shift 2 ;;
    --port=*)      APP_PORT="${1#*=}"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$APP_URL" ]; then
  APP_URL="http://localhost:$APP_PORT"
fi

# --- Runtime detection ---
if [ -n "$RUNTIME" ]; then
  command -v "$RUNTIME" >/dev/null
else
  if command -v podman >/dev/null 2>&1; then RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then RUNTIME=docker
  else echo "Install podman or docker"; exit 1
  fi
fi

# --- Stop only ---
if [ "$STOP_ONLY" = true ]; then
  "$RUNTIME" rm -f "$CONTAINER_NAME" || true
  exit 0
fi

# --- Ensure Podman machine is running (macOS/Windows) ---
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

# --- Hash deps ---
mkdir -p .devcontainer
_hash_inputs=()
for f in "${DEPS_HASH_FILES[@]}"; do
  [ -f "$f" ] && _hash_inputs+=("$f")
done
CURRENT_HASH=$(sha256sum "${_hash_inputs[@]}" 2>/dev/null | sha256sum | cut -d' ' -f1)
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"
if [[ "$CURRENT_HASH" != "$LAST_HASH" && "$FORCE_CLEAN" = false ]]; then
  REBUILD=true
fi

# --- Force clean ---
if [ "$FORCE_CLEAN" = true ]; then
  "$RUNTIME" rm -f "$CONTAINER_NAME" || true
  "$RUNTIME" rmi -f "$IMAGE_NAME" || true
  "$RUNTIME" volume rm -f "$PNPM_STORE_VOL" "$NODE_MODULES_VOL" "$NEXT_CACHE_VOL" || true
  rm -f "$DEP_HASH_FILE" || true
fi

# --- Build ---
if [ "$REBUILD" = true ]; then
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target dev \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"
  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
fi

# --- Restart if running ---
if "$RUNTIME" ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  "$RUNTIME" rm -f "$CONTAINER_NAME"
fi

# --- Mounts ---
RUN_EXTRA_ARGS=()
WORKDIR_MOUNT="$PWD:/workspace"
if [ "$RUNTIME" = "podman" ]; then
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  RUN_EXTRA_ARGS+=(--add-host=host.containers.internal:host-gateway)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
else
  RUN_EXTRA_ARGS+=(--user "$(id -u):$(id -g)")
fi

# --- ENV FILES (CRITICAL FIX) ---
ENV_FILE_ARGS=()
[ -f "$PWD/.env" ] && ENV_FILE_ARGS+=(--env-file "$PWD/.env")
[ -f "$PWD/.env.local" ] && ENV_FILE_ARGS+=(--env-file "$PWD/.env.local")

PORT_PUBLISH="127.0.0.1:${APP_PORT}:${APP_PORT}"

  # --- Run container ---
  RUN_MODE_ARGS=()
  if [ "$DETACH" = true ]; then
    RUN_MODE_ARGS+=(-d)
  else
    RUN_MODE_ARGS+=(-it)
  fi

  "$RUNTIME" run --rm "${RUN_MODE_ARGS[@]}" \
    --name "$CONTAINER_NAME" \
    "${ENV_FILE_ARGS[@]}" \
    -p "$PORT_PUBLISH" \
  -e PORT="$APP_PORT" \
  -e PNPM_VERSION="$PNPM_VERSION" \
  -e COREPACK_ENABLE_STRICT=1 \
  -e PNPM_STORE_DIR="/workspace/.pnpm-store" \
  -v "$WORKDIR_MOUNT" \
  --volume "${PNPM_STORE_VOL}:/workspace/.pnpm-store" \
  --volume "${NODE_MODULES_VOL}:/workspace/node_modules" \
  --volume "${NEXT_CACHE_VOL}:/workspace/.next" \
  "${RUN_EXTRA_ARGS[@]}" \
  "$IMAGE_NAME" \
bash -lc "
corepack enable
corepack prepare pnpm@${PNPM_VERSION} --activate
pnpm config set store-dir /workspace/.pnpm-store

pnpm install --prefer-offline || true

pnpm prisma:generate || true

exec pnpm dev --port \$PORT --hostname 0.0.0.0
"

echo "Container: $CONTAINER_NAME"
echo "App: $APP_URL"
