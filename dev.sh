#!/usr/bin/env bash
set -euo pipefail

# 🚀 Aljama Wallet Development Runner (Podman Edition)

# --- Defaults ---
IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-http://localhost:$APP_PORT}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
NODE_VOLUME="${NODE_VOLUME:-aljama_node_modules}"
STORE_VOLUME="${STORE_VOLUME:-aljama_pnpm_store}"

# --- Load .env if present ---
if [ -f .env ]; then
  if grep -qE '^[A-Z0-9_]+=\s+' .env; then
    echo "❌ Invalid .env format detected (spaces after =)."
    exit 1
  fi
  set -a
  source .env
  set +a
fi

# --- Verify tooling ---
if ! command -v podman &>/dev/null; then
  echo "❌ Podman not found in PATH."
  exit 1
fi

# --- CLI Flags ---
for arg in "$@"; do
  case $arg in
    --force-clean) FORCE_CLEAN=true ;;
    --rebuild)     REBUILD=true ;;
    --stop)
      echo "🛑 Stopping container $CONTAINER_NAME..."
      podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
      exit 0
      ;;
    -h|--help)
      echo "Usage: ./dev.sh [--rebuild] [--force-clean] [--stop]"
      exit 0
      ;;
  esac
done

# --- Sanity check ---
if [ ! -f package.json ]; then
  echo "❌ package.json not found. Run from project root."
  exit 1
fi

# --- Optional node version hint ---
node_version=$(jq -r '.engines.node // empty' package.json 2>/dev/null || true)
if [ -n "$node_version" ]; then
  echo "🧠 Node version specified in package.json: $node_version"
fi

# --- Hash dependencies to trigger rebuild automatically ---
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
CURRENT_HASH=$(sha256sum package.json pnpm-lock.yaml | sha256sum | cut -d' ' -f1)
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"

if [[ "$CURRENT_HASH" != "$LAST_HASH" && "$FORCE_CLEAN" = false ]]; then
  echo "📦 Dependencies changed — rebuild triggered."
  REBUILD=true
fi

# --- Force clean option ---
if [ "$FORCE_CLEAN" = true ]; then
  echo "🧹 Removing container, image, and volumes..."
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME" 2>/dev/null || true
  podman volume rm -f "$NODE_VOLUME" "$STORE_VOLUME" 2>/dev/null || true
fi

# --- Ensure volumes exist ---
podman volume inspect "$NODE_VOLUME" >/dev/null 2>&1 || podman volume create "$NODE_VOLUME" >/dev/null
podman volume inspect "$STORE_VOLUME" >/dev/null 2>&1 || podman volume create "$STORE_VOLUME" >/dev/null

# --- Build image ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
  podman build -f .devcontainer/Containerfile -t "$IMAGE_NAME" "$BUILD_CONTEXT"
  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
else
  echo "📦 Using existing development image."
fi

# --- Run container ---
echo "🚀 Running development container at $APP_URL..."
exec podman run --rm -it \
  --name "$CONTAINER_NAME" \
  --user "$(id -u)":"$(id -g)" \
  -p "$APP_PORT:$APP_PORT" \
  -e PORT="$APP_PORT" \
  -e COREPACK_ENABLE_STRICT=1 \
  -e PNPM_STORE_DIR="/workspace/.pnpm-store" \
  -v "$PWD:/workspace:Z" \
  -v "$STORE_VOLUME:/workspace/.pnpm-store:U,Z" \
  "$IMAGE_NAME" \
  bash -lc '
    set -euo pipefail
    corepack enable >/dev/null 2>&1 || true
    pnpm -v

    # ensure writable dirs
    mkdir -p /workspace/node_modules /workspace/.pnpm-store
    chmod -R u+rwX,go+rX /workspace/node_modules /workspace/.pnpm-store || true

    pnpm config set store-dir /workspace/.pnpm-store
    pnpm approve-builds @prisma/client prisma sharp keccak bufferutil utf-8-validate || true

    CI= pnpm install --no-frozen-lockfile
    test -x node_modules/.bin/next || pnpm add -D next
    exec pnpm dev
  '
# --- End of script ---