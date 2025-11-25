#!/usr/bin/env bash
set -euo pipefail

# Aljama Wallet Development Runner (Podman/Docker)

# --- Defaults ---
IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
RUNTIME="${CONTAINER_RUNTIME:-}"          
# podman|docker (auto if empty)

# --- .env (optional) ---
if [ -f .env ]; then
  if grep -qE '^[A-Z0-9_]+=\s+' .env; then
    echo "Invalid .env format: spaces after '='"
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# --- CLI ---
STOP_ONLY=false
while (($#)); do
  case $1 in
    --force-clean) FORCE_CLEAN=true; shift ;;
    --rebuild)     REBUILD=true; shift ;;
    --stop)        STOP_ONLY=true; shift ;;
    --port)        APP_PORT="${2:?}"; shift 2 ;;
    --port=*)      APP_PORT="${1#*=}"; shift ;;
    --image-name)  IMAGE_NAME="${2:?}"; shift 2 ;;
    --image-name=*) IMAGE_NAME="${1#*=}"; shift ;;
    --container-name) CONTAINER_NAME="${2:?}"; shift 2 ;;
    --container-name=*) CONTAINER_NAME="${1#*=}"; shift ;;
    --build-context) BUILD_CONTEXT="${2:?}"; shift 2 ;;
    --build-context=*) BUILD_CONTEXT="${1#*=}"; shift ;;
    --runtime)     RUNTIME="${2:?}"; shift 2 ;;
    --runtime=*)   RUNTIME="${1#*=}"; shift ;;
    -h|--help)
      cat <<EOF
Usage: ./dev.sh [--rebuild] [--force-clean] [--stop] [--port N] [--runtime podman|docker]
                 [--image-name NAME] [--container-name NAME] [--build-context PATH]
EOF
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Validate ---
if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  echo "Invalid port: $APP_PORT"
  exit 1
fi

if [ -z "$APP_URL" ]; then
  APP_URL="http://localhost:$APP_PORT"
fi

[ -f package.json ] || { echo "package.json not found (run from project root)"; exit 1; }

# --- Runtime detect (prefer podman) ---
if [ -n "$RUNTIME" ]; then
  command -v "$RUNTIME" >/dev/null || { echo "Runtime '$RUNTIME' not found"; exit 1; }
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

# --- Optional Node engines hint ---
if command -v jq >/dev/null 2>&1; then
  nv=$(jq -r '.engines.node // empty' package.json || true)
  [ -n "$nv" ] && echo "Node engines: $nv"
fi

# --- Lockfile bootstrap (if missing) ---
if [ ! -f pnpm-lock.yaml ]; then
  echo "pnpm-lock.yaml missing — creating"
  if command -v pnpm >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10.10.0 --activate >/dev/null 2>&1 || true
    pnpm install
  else
    "$RUNTIME" run --rm -v "$PWD:/workspace" -w /workspace node:23.11.0 \
      bash -lc 'set -euo pipefail; corepack enable; corepack prepare pnpm@10.10.0 --activate; pnpm install'
  fi
fi

# --- Smart rebuild on deps change ---
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
mkdir -p .devcontainer
CURRENT_HASH=$(sha256sum package.json pnpm-lock.yaml | sha256sum | cut -d' ' -f1)
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"

if [[ "$CURRENT_HASH" != "$LAST_HASH" && "$FORCE_CLEAN" = false ]]; then
  echo "Dependencies changed — rebuild triggered"
  REBUILD=true
fi

# --- Stop only ---
if [ "$STOP_ONLY" = true ]; then
  echo "Stopping $CONTAINER_NAME"
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit 0
fi

# --- Force clean ---
if [ "$FORCE_CLEAN" = true ]; then
  echo "Force clean: remove container/image"
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" rmi -f "$IMAGE_NAME"    >/dev/null 2>&1 || true
fi

# --- Build image ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "Building dev image (target=dev)..."
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target dev \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"
  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
else
  echo "Using existing dev image"
fi

# --- Runtime-specific run options ---
RUN_EXTRA_ARGS=()
WORKDIR_MOUNT="$PWD:/workspace"
if [ "$RUNTIME" = "podman" ]; then
  RUN_EXTRA_ARGS+=(--userns=keep-id --user "$(id -u):$(id -g)")
  WORKDIR_MOUNT="$PWD:/workspace:Z"
else
  RUN_EXTRA_ARGS+=(--user "$(id -u):$(id -g)")
fi

echo "Running dev container at $APP_URL"

exec "$RUNTIME" run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "$APP_PORT:$APP_PORT" \
  -e PORT="$APP_PORT" \
  -e COREPACK_ENABLE_STRICT=1 \
  -e PNPM_STORE_DIR="/workspace/.pnpm-store" \
  -v "$WORKDIR_MOUNT" \
  "${RUN_EXTRA_ARGS[@]}" \
  "$IMAGE_NAME" \

  bash -lc '
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@10.10.0 --activate >/dev/null 2>&1 || true
    pnpm -v

    mkdir -p /workspace/node_modules /workspace/.pnpm-store
    chmod -R u+rwX,go+rX /workspace/node_modules /workspace/.pnpm-store || true

    pnpm config set store-dir /workspace/.pnpm-store
    pnpm approve-builds @prisma/client prisma sharp keccak bufferutil utf-8-validate || true

    CI= pnpm install --no-frozen-lockfile
    test -x node_modules/.bin/next || pnpm add -D next

    # 🔑 Force sane env for Next dev
    unset NODE_ENV
    export NODE_ENV=development

    # Use container PORT / APP_PORT, but no extra `--`
    : "${PORT:=$APP_PORT}"

    pnpm prisma:generate || {
      echo "❌ prisma:generate failed"
      exit 1
    }
    exec pnpm dev --port "$PORT"
'
# --- End of dev.sh ---
