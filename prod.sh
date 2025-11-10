#!/bin/bash
set -euo pipefail

# 🚀 Aljama Wallet Production Runner

IMAGE_NAME="${IMAGE_NAME:-aljama-wallet-prod}"
CONTAINER_NAME="${CONTAINER_NAME:-aljama-prod}"
APP_PORT="${APP_PORT:-2999}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
APP_URL_ENV="${APP_URL:-}"
APP_URL=""
RUNTIME="${CONTAINER_RUNTIME:-}"

while (($#)); do
  case $1 in
    --port)
      if [ $# -lt 2 ]; then
        echo "❌ --port flag requires a value."
        exit 1
      fi
      APP_PORT="$2"
      shift 2
      ;;
    --port=*)
      APP_PORT="${1#*=}"
      shift
      ;;
    --image-name)
      if [ $# -lt 2 ]; then
        echo "❌ --image-name flag requires a value."
        exit 1
      fi
      IMAGE_NAME="$2"
      shift 2
      ;;
    --image-name=*)
      IMAGE_NAME="${1#*=}"
      shift
      ;;
    --container-name)
      if [ $# -lt 2 ]; then
        echo "❌ --container-name flag requires a value."
        exit 1
      fi
      CONTAINER_NAME="$2"
      shift 2
      ;;
    --container-name=*)
      CONTAINER_NAME="${1#*=}"
      shift
      ;;
    --build-context)
      if [ $# -lt 2 ]; then
        echo "❌ --build-context flag requires a value."
        exit 1
      fi
      BUILD_CONTEXT="$2"
      shift 2
      ;;
    --build-context=*)
      BUILD_CONTEXT="${1#*=}"
      shift
      ;;
    --runtime)
      if [ $# -lt 2 ]; then
        echo "❌ --runtime flag requires a value."
        exit 1
      fi
      RUNTIME="$2"
      shift 2
      ;;
    --runtime=*)
      RUNTIME="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: ./prod.sh [--port <number>] [--image-name <name>] [--container-name <name>] [--build-context <path>] [--runtime <podman|docker>]"
      echo "  --port <number>         Override the port exposed by the prod server (default: 2999)"
      echo "  --image-name <name>     Custom tag for the built image"
      echo "  --container-name <name> Custom name for the running container"
      echo "  --build-context <path>  Alternate build context (default: current directory)"
      echo "  --runtime <name>        Force podman or docker"
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Use --help to see available options."
      exit 1
      ;;
  esac
done

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  echo "❌ Invalid port '$APP_PORT'. Please choose a value between 1 and 65535."
  exit 1
fi

if [ -n "$APP_URL_ENV" ]; then
  APP_URL="$APP_URL_ENV"
else
  APP_URL="http://localhost:$APP_PORT"
fi

# --- Resolve container runtime (Podman preferred, Docker fallback) ---
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
