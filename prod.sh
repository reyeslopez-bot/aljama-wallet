#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/lib/container-common.sh
source "$SCRIPT_DIR/scripts/lib/container-common.sh"

IMAGE_NAME="${IMAGE_NAME:-aljama-wallet-prod}"
CONTAINER_NAME="${CONTAINER_NAME:-aljama-prod}"
APP_PORT="${APP_PORT:-2999}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
APP_URL_ENV="${APP_URL:-}"
APP_URL=""
RUNTIME="${CONTAINER_RUNTIME:-}"

load_env_exports false ".env" ".env.local"

while (($#)); do
  case $1 in
    --port) APP_PORT="${2:?}"; shift 2 ;;
    --port=*) APP_PORT="${1#*=}"; shift ;;
    --image-name) IMAGE_NAME="${2:?}"; shift 2 ;;
    --image-name=*) IMAGE_NAME="${1#*=}"; shift ;;
    --container-name) CONTAINER_NAME="${2:?}"; shift 2 ;;
    --container-name=*) CONTAINER_NAME="${1#*=}"; shift ;;
    --build-context) BUILD_CONTEXT="${2:?}"; shift 2 ;;
    --build-context=*) BUILD_CONTEXT="${1#*=}"; shift ;;
    --runtime) RUNTIME="${2:?}"; shift 2 ;;
    --runtime=*) RUNTIME="${1#*=}"; shift ;;
    -h|--help)
      cat <<'EOF'
Usage: ./prod.sh [--port <number>] [--image-name <name>] [--container-name <name>] [--build-context <path>] [--runtime <podman|docker>]
EOF
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

validate_port "$APP_PORT"

if [ -n "$APP_URL_ENV" ]; then
  APP_URL="$APP_URL_ENV"
else
  APP_URL="http://localhost:$APP_PORT"
fi

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  echo "NEXTAUTH_SECRET is required for production runs."
  echo "Generate one with: openssl rand -base64 32"
  exit 1
fi

RUNTIME="$(detect_container_runtime "$RUNTIME")"
ensure_runtime_ready "$RUNTIME"

VOLUME_SUFFIX=""
if [ "$RUNTIME" = "podman" ]; then
  VOLUME_SUFFIX=":Z"
fi

remove_container_if_exists "$RUNTIME" "$CONTAINER_NAME"

"$RUNTIME" build \
  -f .devcontainer/Containerfile \
  --target prod \
  -t "$IMAGE_NAME" \
  "$BUILD_CONTEXT"

RUN_CMD=("$RUNTIME" run "--rm" "-d")
RUN_CMD+=("--name" "$CONTAINER_NAME")
RUN_CMD+=("-p" "$APP_PORT:$APP_PORT")
RUN_CMD+=("-e" "PORT=$APP_PORT")
RUN_CMD+=("-e" "HOSTNAME=0.0.0.0")

ENV_FILE_ARGS=()
append_env_file_args ENV_FILE_ARGS "$PWD/.env" "$PWD/.env.local"
if [ "${#ENV_FILE_ARGS[@]}" -gt 0 ]; then
  RUN_CMD+=("${ENV_FILE_ARGS[@]}")
fi

if [ -d ./infra/runtime ]; then
  RUN_CMD+=("-v" "$PWD/infra/runtime:/runtime$VOLUME_SUFFIX")
fi

RUN_CMD+=("$IMAGE_NAME")

"${RUN_CMD[@]}"

echo "Aljama Wallet running at $APP_URL"
