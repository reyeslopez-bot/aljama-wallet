#!/usr/bin/env bash
set -euo pipefail

# 🚀 Aljama Wallet Development Runner (Podman Edition)

IMAGE_NAME="localhost/nextjs-dev"
CONTAINER_NAME="aljama-dev"
APP_PORT=2998
APP_URL="http://localhost:$APP_PORT"
WORKDIR="/workspace"
BUILD_CONTEXT="."
FORCE_CLEAN=true
REBUILD=true

# --- Parse CLI Flags ---
for arg in "$@"; do
  case $arg in
    --force-clean)  FORCE_CLEAN=true ;;
    --rebuild)      REBUILD=true     ;;
    *)              ;;
  esac
done

# --- Pre-check Lockfile ---
if [ ! -f pnpm-lock.yaml ]; then
  echo "❌ ERROR: pnpm-lock.yaml not found!"
  echo "➡️  Run 'pnpm install' first."
  exit 1
fi

# --- Optional Full Clean ---
if [ "$FORCE_CLEAN" = true ]; then
  echo "🔥 Full clean: removing old dev container and image..."
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME"       2>/dev/null || true
fi

# --- Smart Rebuild Logic ---
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
CURRENT_HASH=$(
  sha256sum package.json pnpm-lock.yaml \
  | sha256sum \
  | cut -d' ' -f1
)

if [ "$REBUILD" = false ] && [ "$FORCE_CLEAN" = false ]; then
  if [ -f "$DEP_HASH_FILE" ]; then
    LAST_HASH=$(<"$DEP_HASH_FILE")
  else
    LAST_HASH=""
  fi

  if [ "$LAST_HASH" != "$CURRENT_HASH" ]; then
    echo "📦 Detected dependency changes. Triggering rebuild..."
    REBUILD=true
    echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
  fi
fi

# --- Build Dev Image if Needed ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
  podman build \
    -f .devcontainer/Containerfile \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"
else
  echo "📦 Using existing development image."
fi

# --- Run the Container ---
echo "🚀 Running development container at $APP_URL..."
podman run --rm --pull=never -it \
  --name "$CONTAINER_NAME" \
  --userns=keep-id \
  -p "$APP_PORT:$APP_PORT" \
  -v "$PWD:/workspace:Z" \
  "$IMAGE_NAME"

