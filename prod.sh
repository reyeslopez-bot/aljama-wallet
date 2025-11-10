#!/bin/bash
set -euo pipefail

# 🚀 Aljama Wallet Production Runner

IMAGE_NAME="${IMAGE_NAME:-aljama-wallet-prod}"
CONTAINER_NAME="${CONTAINER_NAME:-aljama-prod}"
APP_PORT="${APP_PORT:-2999}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
APP_URL="${APP_URL:-http://localhost:$APP_PORT}"

# --- Resolve container runtime (Podman preferred, Docker fallback) ---
RUNTIME=${CONTAINER_RUNTIME:-}

if [ -n "$RUNTIME" ]; then
  if ! command -v "$RUNTIME" >/dev/null 2>&1; then
    echo "❌ Requested container runtime '$RUNTIME' is not available on this system."
    exit 1
  fi
else
  if command -v podman >/dev/null 2>&1; then
    RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then
    RUNTIME=docker
  else
    echo "❌ Neither Podman nor Docker is installed. Please install one of them to continue."
    exit 1
  fi
fi

VOLUME_SUFFIX=""
if [ "$RUNTIME" = "podman" ]; then
  VOLUME_SUFFIX=":Z"
fi

# --- Kill existing prod container if running ---
"$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

# --- Build production image ---
"$RUNTIME" build \
  -f .devcontainer/Containerfile \
  --target prod \
  -t "$IMAGE_NAME" \
  "$BUILD_CONTEXT"

# --- Run production container ---
RUN_CMD=("$RUNTIME" run "--rm" "-d")
RUN_CMD+=("--name" "$CONTAINER_NAME")
RUN_CMD+=("-p" "$APP_PORT:$APP_PORT")
RUN_CMD+=("-e" "PORT=$APP_PORT")
RUN_CMD+=("-e" "HOSTNAME=0.0.0.0")
# Bind mount optional runtime secrets
if [ -d ./infra/runtime ]; then
  RUN_CMD+=("-v" "$PWD/infra/runtime:/runtime$VOLUME_SUFFIX")
fi
RUN_CMD+=("$IMAGE_NAME")

"${RUN_CMD[@]}"

echo "🚀 Aljama Wallet running at $APP_URL"
