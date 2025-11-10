#!/bin/bash
set -euo pipefail

# 🚀 Aljama Wallet Development Runner (Container-aware)

# --- Fallback defaults — use existing env vars if defined ---
IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL="${APP_URL:-http://localhost:$APP_PORT}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"

# --- Optional: Load .env file if present ---
if [ -f .env ]; then
  # Check for invalid spacing like VAR= value (Bash will break)
  if grep -qE '^[A-Z0-9_]+=\s+' .env; then
    echo "❌ Invalid .env format detected. Remove spaces between keys and values."
    echo "   For example: 'POSTGRES_URL= value' → should be 'POSTGRES_URL=value'"
    exit 1
  fi

  # Load environment variables safely
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

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

RUN_EXTRA_ARGS=()
PULL_BEHAVIOR=()
WORKDIR_MOUNT="$PWD:/workspace"

if [ "$RUNTIME" = "podman" ]; then
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  PULL_BEHAVIOR+=(--pull=never)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
fi

# --- Parse CLI Flags ---
for arg in "$@"; do
  case $arg in
    --force-clean) FORCE_CLEAN=true ;;
    --rebuild)     REBUILD=true     ;;
    --stop)
      echo "🛑 Stopping and removing container $CONTAINER_NAME..."
      "$RUNTIME" stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
      "$RUNTIME" rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
      exit 0
      ;;
    -h|--help)
      echo "Usage: ./dev.sh [--rebuild] [--force-clean] [--stop]"
      echo "  --rebuild       Rebuilds the development image"
      echo "  --force-clean   Removes and rebuilds image from scratch"
      echo "  --stop          Stops and removes the running container"
      exit 0
      ;;
    *) ;;
  esac
done

# --- Check for required project files ---
if [ ! -f package.json ]; then
  echo "❌ package.json not found. Make sure you're in the root of your project."
  exit 1
fi

# --- Optional: show node version from package.json ---
if command -v jq >/dev/null 2>&1; then
  node_version=$(jq -r '.engines.node' package.json 2>/dev/null || echo "")
  if [ -n "$node_version" ]; then
    echo "🧠 Node version specified in package.json: $node_version"
  fi
else
  echo "ℹ️ jq not found on host. Skipping Node engine display."
fi

# --- Pre-check Lockfile ---
if [ ! -f pnpm-lock.yaml ]; then
  echo "⚠️  pnpm-lock.yaml not found. Installing dependencies to generate it..."
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  else
    echo "ℹ️ pnpm is not available on the host. Using a temporary container to generate the lockfile..."
    "$RUNTIME" run --rm -v "$PWD:/workspace" -w /workspace node:23.11.0 \
      bash -lc "set -euo pipefail; corepack enable; corepack prepare pnpm@10.10.0 --activate; corepack use pnpm@10.10.0; pnpm install"
  fi
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

# --- Force Clean Image (optional nuke) ---
if [ "$FORCE_CLEAN" = true ]; then
  echo "🧹 Forcing clean build: removing image and container..."
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" rmi -f "$IMAGE_NAME"    >/dev/null 2>&1 || true
fi

# --- Build Dev Image if Needed ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target dev \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"

  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"

else
  echo "📦 Using existing development image."
fi

# --- Run the Container ---
echo "🚀 Running development container at $APP_URL..."
RUN_CMD=("$RUNTIME" run "--rm" "-it")
RUN_CMD+=("${PULL_BEHAVIOR[@]}")
RUN_CMD+=("--name" "$CONTAINER_NAME")
RUN_CMD+=("${RUN_EXTRA_ARGS[@]}")
RUN_CMD+=("-e" "PORT=$APP_PORT")
RUN_CMD+=("-e" "HOSTNAME=0.0.0.0")
RUN_CMD+=("-p" "$APP_PORT:$APP_PORT")
RUN_CMD+=("-v" "$WORKDIR_MOUNT")
RUN_CMD+=("$IMAGE_NAME")

"${RUN_CMD[@]}"
