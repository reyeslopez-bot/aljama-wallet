#!/bin/bash
set -euo pipefail

# 🚀 Aljama Wallet Development Runner (Podman Edition)

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
  source .env
  set +a
fi

# --- Tooling check ---
if ! command -v podman &> /dev/null; then
  echo "❌ Podman is not installed or not in PATH. Please install Podman to continue."
  exit 1
fi

# --- Parse CLI Flags ---
for arg in "$@"; do
  case $arg in
    --force-clean) FORCE_CLEAN=true ;;
    --rebuild)     REBUILD=true     ;;
    --stop)
      echo "🛑 Stopping and removing container $CONTAINER_NAME..."
      podman stop "$CONTAINER_NAME" && podman rm "$CONTAINER_NAME"
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
node_version=$(jq -r '.engines.node' package.json 2>/dev/null || echo "")
if [ -n "$node_version" ]; then
  echo "🧠 Node version specified in package.json: $node_version"
fi
# --- Pre-check Lockfile ---
if [ ! -f pnpm-lock.yaml ]; then
  echo "⚠️  pnpm-lock.yaml not found. Installing dependencies to generate it..."
  pnpm install
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
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME"    2>/dev/null || true
fi

# --- Build Dev Image if Needed ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
  podman build \
    -f .devcontainer/Containerfile \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"

  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"

else
  echo "📦 Using existing development image."
fi

# --- Run the Container ---
echo "🚀 Running development container at $APP_URL..."
podman run --pull=never -it \
  --name "$CONTAINER_NAME" \
  --userns=keep-id \
  -p "$APP_PORT:$APP_PORT" \
  -v "$PWD:/workspace:Z" \
  "$IMAGE_NAME"

