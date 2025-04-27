#!/bin/bash

# 🌱 Aljama Wallet Prod Runner (Podman Edition)

IMAGE_NAME="nextjs-prod"
CONTAINER_NAME="aljama-prod"
APP_PORT=2999
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
  echo "🔥 Full clean: removing old container and image..."
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME" 2>/dev/null || true
fi

# --- Build image ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building production image..."
  podman build -f .devcontainer/Containerfile -t "$IMAGE_NAME" "$BUILD_CONTEXT"
else
  echo "📦 Using existing production image."
fi

# --- Run container ---
echo "🚀 Running production container..."
podman run --rm -it --name "$CONTAINER_NAME" -p "$APP_PORT:$APP_PORT" "$IMAGE_NAME"


