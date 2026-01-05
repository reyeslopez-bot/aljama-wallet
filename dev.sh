# dev.sh
#!/usr/bin/env bash
set -euo pipefail
# Aljama Wallet Development Runner (Podman/Docker)

IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
RUNTIME="${CONTAINER_RUNTIME:-}" # podman|docker (auto if empty)

PNPM_STORE_VOL="${PNPM_STORE_VOL:-aljama_pnpm_store}"
NODE_MODULES_VOL="${NODE_MODULES_VOL:-aljama_node_modules}"
PNPM_VERSION="${PNPM_VERSION:-10.27.0}"
echo "pnpm version pin: ${PNPM_VERSION:-unset}"

# hash inputs (deps + container wiring)
DEPS_HASH_FILES=("package.json" "pnpm-lock.yaml" "pnpm-workspace.yaml" ".devcontainer/Containerfile")
DEP_HASH_FILE=".devcontainer/.last-deps-hash"

# mode
STOP_ONLY=false
SHELL_ONLY=false
TAIL_LOGS=false
DETACH=true

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
Usage:
  ./dev.sh [--rebuild] [--force-clean] [--stop] [--shell] [--logs] [--attach|--detach]
           [--port N] [--runtime podman|docker]
Env:
  PNPM_STORE_VOL=aljama_pnpm_store
  PNPM_VERSION=10.27.0

Notes:
  Default is --detach, so you can exec into the container:
    podman exec -it nextjs-container bash
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
  if command -v podman >/dev/null 2>&1; then RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then RUNTIME=docker
  else echo "Install podman or docker"; exit 1
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
mkdir -p .devcontainer
_hash_inputs=()
for f in "${DEPS_HASH_FILES[@]}"; do
  [ -f "$f" ] && _hash_inputs+=("$f")
done
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
  "$RUNTIME" rmi -f "$IMAGE_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" volume rm -f "$PNPM_STORE_VOL" >/dev/null 2>&1 || true
  "$RUNTIME" volume rm -f "$NODE_MODULES_VOL" >/dev/null 2>&1 || true
  rm -f "$DEP_HASH_FILE" >/dev/null 2>&1 || true
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

# --- Restart running container if rebuilt ---
if [ "$REBUILD" = true ] && "$RUNTIME" ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Rebuild requested — restarting running container: $CONTAINER_NAME"
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

# --- Mounts / user mapping ---
RUN_EXTRA_ARGS=()
WORKDIR_MOUNT="$PWD:/workspace"

if [ "$RUNTIME" = "podman" ]; then
  # keep-id makes container uid map to host uid -> avoids root-owned files
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
elif [ "$RUNTIME" = "docker" ]; then
  RUN_EXTRA_ARGS+=(--user "$(id -u):$(id -g)")
fi

# --- If container already running, reuse it ---
if "$RUNTIME" ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  echo "Container already running: $CONTAINER_NAME"
if [ "$TAIL_LOGS" = true ]; then
  exec "$RUNTIME" logs -f --tail=200 "$CONTAINER_NAME"
  # or: exec "$RUNTIME" logs -f --since=10s "$CONTAINER_NAME"
fi
  if [ "$SHELL_ONLY" = true ]; then exec "$RUNTIME" exec -it "$CONTAINER_NAME" bash; fi
  echo "App: $APP_URL"
  exit 0
fi

# --- Run dev container ---
echo "Starting dev container at $APP_URL"

RUN_MODE_ARGS=()
if [ "$DETACH" = true ]; then RUN_MODE_ARGS+=(-d); else RUN_MODE_ARGS+=(-it); fi

"$RUNTIME" run --rm "${RUN_MODE_ARGS[@]}" \
  --name "$CONTAINER_NAME" \
  -p "$APP_PORT:$APP_PORT" \
  -e PORT="$APP_PORT" \
  -e PNPM_VERSION="$PNPM_VERSION" \
  -e COREPACK_ENABLE_STRICT=1 \
  -e PNPM_STORE_DIR="/workspace/.pnpm-store" \
  -v "$WORKDIR_MOUNT" \
  --volume "${PNPM_STORE_VOL}:/workspace/.pnpm-store" \
  --volume "${NODE_MODULES_VOL}:/workspace/node_modules" \
  "${RUN_EXTRA_ARGS[@]}" \
  "$IMAGE_NAME" \
bash -lc "$(cat <<'BASH'
set -euo pipefail

corepack enable >/dev/null 2>&1 || true
corepack prepare "pnpm@${PNPM_VERSION}" --activate >/dev/null 2>&1 || true

pnpm config set store-dir /workspace/.pnpm-store

mkdir -p /workspace/.pnpm-store
chmod u+rwX /workspace /workspace/node_modules /workspace/.pnpm-store 2>/dev/null || true

CI=true PNPM_CONFIRM_DELETE=1 pnpm install --frozen-lockfile --prefer-offline || (
  echo 'pnpm install failed; wiping /workspace/node_modules once and retrying'
  rm -rf /workspace/node_modules
  CI=true PNPM_CONFIRM_DELETE=1 pnpm install --frozen-lockfile --prefer-offline
)

PRISMA_HASH_FILE="/workspace/.prisma/.last-schema-hash"
mkdir -p /workspace/.prisma

CURRENT_PRISMA_HASH="$(sha256sum prisma/crdb/schema.prisma prisma/pg/schema.prisma 2>/dev/null | sha256sum | cut -d' ' -f1)"
LAST_PRISMA_HASH="$(cat "$PRISMA_HASH_FILE" 2>/dev/null || echo '')"

if [ "$CURRENT_PRISMA_HASH" != "$LAST_PRISMA_HASH" ]; then
  echo 'Prisma schema changed — generating clients'
  pnpm prisma:generate
  echo "$CURRENT_PRISMA_HASH" > "$PRISMA_HASH_FILE"
else
  echo 'Prisma schema unchanged — skipping generate'
fi

exec pnpm dev --port "$PORT" --hostname 0.0.0.0
BASH
)"

# --- Post-run actions ---
if [ "$TAIL_LOGS" = true ]; then
  exec "$RUNTIME" logs -f "$CONTAINER_NAME"
fi

if [ "$SHELL_ONLY" = true ]; then
  exec "$RUNTIME" exec -it "$CONTAINER_NAME" bash
fi

echo "Container: $CONTAINER_NAME"
echo "App: $APP_URL"
echo "Enter shell: $RUNTIME exec -it $CONTAINER_NAME bash"
echo "Logs:        $RUNTIME logs -f $CONTAINER_NAME"