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
RUNTIME="${CONTAINER_RUNTIME:-}" # podman|docker (auto if empty)

# Named volume for persistent pnpm store
PNPM_STORE_VOL="${PNPM_STORE_VOL:-aljama_pnpm_store}"

# Keep pnpm version consistent with Containerfile base
PNPM_VERSION="${PNPM_VERSION:-10.25.0}"

# Files that should trigger a rebuild if they change (deps+container wiring)
DEPS_HASH_FILES=("package.json" "pnpm-lock.yaml" ".devcontainer/Containerfile" "pnpm-workspace.yaml")

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
Env:
  PNPM_STORE_VOL=aljama_pnpm_store
  PNPM_VERSION=10.25.0
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
    corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null 2>&1 || true
    pnpm install
  else
    "$RUNTIME" run --rm -v "$PWD:/workspace" -w /workspace node:24.3.0 \
      bash -lc "set -euo pipefail; corepack enable; corepack prepare pnpm@${PNPM_VERSION} --activate; pnpm install"
  fi
fi

# --- Smart rebuild on deps/container change ---
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
mkdir -p .devcontainer

_hash_inputs=()
for f in "${DEPS_HASH_FILES[@]}"; do
  [ -f "$f" ] && _hash_inputs+=("$f")
done

if [ "${#_hash_inputs[@]}" -eq 0 ]; then
  echo "No hash inputs found (expected: ${DEPS_HASH_FILES[*]})"
  exit 1
fi

CURRENT_HASH=$(sha256sum "${_hash_inputs[@]}" 2>/dev/null | sha256sum | cut -d' ' -f1)
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"

if [[ "$CURRENT_HASH" != "$LAST_HASH" && "$FORCE_CLEAN" = false ]]; then
  echo "Dependencies/container config changed — rebuild triggered"
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
  echo "Force clean: remove container/image + pnpm store volume"
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" rmi -f "$IMAGE_NAME"    >/dev/null 2>&1 || true
  "$RUNTIME" volume rm -f "$PNPM_STORE_VOL" >/dev/null 2>&1 || true
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
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
elif [ "$RUNTIME" = "docker" ]; then
  RUN_EXTRA_ARGS+=(--user "$(id -u):$(id -g)")
fi

# --- Run dev container ---
echo "Running dev container at $APP_URL"

exec "$RUNTIME" run --rm -it \
  --name "$CONTAINER_NAME" \
  -p "$APP_PORT:$APP_PORT" \
  -e PORT="$APP_PORT" \
  -e COREPACK_ENABLE_STRICT=1 \
  -e PNPM_STORE_DIR="/workspace/.pnpm-store" \
  -v "$WORKDIR_MOUNT" \
  --volume "${PNPM_STORE_VOL}:/workspace/.pnpm-store" \
  "${RUN_EXTRA_ARGS[@]}" \
  "$IMAGE_NAME" \
  bash -lc "set -euo pipefail
    corepack enable >/dev/null 2>&1 || true
    corepack prepare pnpm@${PNPM_VERSION} --activate >/dev/null 2>&1 || true

    pnpm -v
    pnpm config set store-dir /workspace/.pnpm-store

    export CI=1

    # Deterministic install without --force.
    # If the bind-mount filesystem flakes and install fails, wipe node_modules once and retry.
    pnpm install --frozen-lockfile --prefer-offline || (
      echo 'pnpm install failed; wiping /workspace/node_modules and retrying once'
      rm -rf /workspace/node_modules
      pnpm install --frozen-lockfile --prefer-offline
    )

    pnpm prisma:generate

    exec pnpm dev --port \"\$PORT\" --hostname 0.0.0.0
  "
# --- End of dev.sh ---