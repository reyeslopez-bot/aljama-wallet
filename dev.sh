#!/bin/bash

# 🚀 Aljama Wallet Development Runner (Podman Edition)

set -e

IMAGE_NAME="localhost/nextjs-dev"
CONTAINER_NAME="aljama-dev"
APP_PORT=2998
APP_URL="http://localhost:$APP_PORT"
WORKDIR="/workspace"
BUILD_CONTEXT="."
FORCE_CLEAN=false
REBUILD=false

# --- Parse Args ---
for arg in "$@"; do
  case $arg in
    --force-clean)
      FORCE_CLEAN=true
      ;;
    --rebuild)
      REBUILD=true
      ;;
    *)
      ;;
  esac
done

# --- Pre-check pnpm-lock.yaml ---
if [ ! -f pnpm-lock.yaml ]; then
  echo "❌ ERROR: pnpm-lock.yaml not found!"
  echo "➡️  Run 'pnpm install' first."
  exit 1
fi

# --- Clean old containers/images ---
if [ "$FORCE_CLEAN" = true ]; then
  echo "🔥 Full clean: removing old dev container and image..."
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME" 2>/dev/null || true
fi

# --- Build dev image ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
  podman build -f .devcontainer/Containerfile -t "$IMAGE_NAME" "$BUILD_CONTEXT"
else
  echo "📦 Using existing development image."
fi

# --- Run container ---
echo "🚀 Running development container at $APP_URL..."
podman run --rm --pull=never -it --name "$CONTAINER_NAME" \
  --userns=keep-id \
  -p "$APP_PORT:$APP_PORT" \
  -v "$PWD:/workspace:Z" \
  "$IMAGE_NAME"

