# prod.sh
#!/usr/bin/env bash
set -euo pipefail

# Aljama Wallet Production Runner

IMAGE_NAME="${IMAGE_NAME:-aljama-wallet-prod}"
CONTAINER_NAME="${CONTAINER_NAME:-aljama-prod}"
APP_PORT="${APP_PORT:-2999}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
APP_URL_ENV="${APP_URL:-}"
APP_URL=""
RUNTIME="${CONTAINER_RUNTIME:-}"

while (($#)); do
  case $1 in
    --port)             APP_PORT="${2:?}"; shift 2 ;;
    --port=*)           APP_PORT="${1#*=}"; shift ;;
    --image-name)       IMAGE_NAME="${2:?}"; shift 2 ;;
    --image-name=*)     IMAGE_NAME="${1#*=}"; shift ;;
    --container-name)   CONTAINER_NAME="${2:?}"; shift 2 ;;
    --container-name=*) CONTAINER_NAME="${1#*=}"; shift ;;
    --build-context)    BUILD_CONTEXT="${2:?}"; shift 2 ;;
    --build-context=*)  BUILD_CONTEXT="${1#*=}"; shift ;;
    --runtime)          RUNTIME="${2:?}"; shift 2 ;;
    --runtime=*)        RUNTIME="${1#*=}"; shift ;;
    -h|--help)
      cat <<EOF
Usage: ./prod.sh [--port <number>] [--image-name <name>] [--container-name <name>] [--build-context <path>] [--runtime <podman|docker>]
EOF
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if ! [[ "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  echo "Invalid port '$APP_PORT'"
  exit 1
fi

if [ -n "$APP_URL_ENV" ]; then
  APP_URL="$APP_URL_ENV"
else
  APP_URL="http://localhost:$APP_PORT"
fi

# Runtime
if [ -n "$RUNTIME" ]; then
  command -v "$RUNTIME" >/dev/null 2>&1 || { echo "Runtime '$RUNTIME' not found"; exit 1; }
else
  if command -v podman >/dev/null 2>&1; then
    RUNTIME=podman
  elif command -v docker >/dev/null 2>&1; then
    RUNTIME=docker
  else
    echo "Neither podman nor docker installed"
    exit 1
  fi
fi

VOLUME_SUFFIX=""
if [ "$RUNTIME" = "podman" ]; then
  VOLUME_SUFFIX=":Z"
fi

# Kill existing
"$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Build prod image
"$RUNTIME" build \
  -f .devcontainer/Containerfile \
  --target prod \
  -t "$IMAGE_NAME" \
  "$BUILD_CONTEXT"

# Run
RUN_CMD=("$RUNTIME" run "--rm" "-d")
RUN_CMD+=("--name" "$CONTAINER_NAME")
RUN_CMD+=("-p" "$APP_PORT:$APP_PORT")
RUN_CMD+=("-e" "PORT=$APP_PORT")
RUN_CMD+=("-e" "HOSTNAME=0.0.0.0")

if [ -d ./infra/runtime ]; then
  RUN_CMD+=("-v" "$PWD/infra/runtime:/runtime$VOLUME_SUFFIX")
fi

RUN_CMD+=("$IMAGE_NAME")

"${RUN_CMD[@]}"

echo "Aljama Wallet running at $APP_URL"
