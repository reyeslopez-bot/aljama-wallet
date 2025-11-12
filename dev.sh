#!/usr/bin/env bash
set -euo pipefail

# 🚀 Aljama Wallet Development Runner (Container-aware)

# --- Defaults ---
IMAGE_NAME="${IMAGE_NAME:-nextjs-dev}"
CONTAINER_NAME="${CONTAINER_NAME:-nextjs-container}"
APP_PORT="${APP_PORT:-2998}"
APP_URL_ENV="${APP_URL:-}"
APP_URL=""
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"
REBUILD="${REBUILD:-false}"
FORCE_CLEAN="${FORCE_CLEAN:-false}"
<<<<<<< HEAD
NODE_VOLUME="${NODE_VOLUME:-aljama_node_modules}"
STORE_VOLUME="${STORE_VOLUME:-aljama_pnpm_store}"
=======
RUNTIME="${CONTAINER_RUNTIME:-}"
STOP_ONLY=false
>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455

# --- Load .env if present ---
if [ -f .env ]; then
  if grep -qE '^[A-Z0-9_]+=\s+' .env; then
    echo "❌ Invalid .env format detected (spaces after =)."
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

<<<<<<< HEAD
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
=======
# --- Parse CLI Flags ---
while (($#)); do
  case $1 in
    --force-clean)
      FORCE_CLEAN=true
      shift
      ;;
    --rebuild)
      REBUILD=true
      shift
      ;;
    --stop)
      STOP_ONLY=true
      shift
      ;;
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
      echo "Usage: ./dev.sh [--rebuild] [--force-clean] [--stop] [--port <number>] [--runtime <podman|docker>]"
      echo "  --rebuild       Rebuilds the development image"
      echo "  --force-clean   Removes and rebuilds image from scratch"
      echo "  --stop          Stops and removes the running container"
      echo "  --port <number> Override the port exposed by the dev server (default: 2998)"
      echo "  --runtime <name>        Force podman or docker"
      echo "  --image-name <name>     Custom dev image tag"
      echo "  --container-name <name> Custom dev container name"
      echo "  --build-context <path>  Alternate build context"
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

RUN_EXTRA_ARGS=()
PULL_BEHAVIOR=()
WORKDIR_MOUNT="$PWD:/workspace"

if [ "$RUNTIME" = "podman" ]; then
  RUN_EXTRA_ARGS+=(--userns=keep-id)
  PULL_BEHAVIOR+=(--pull=never)
  WORKDIR_MOUNT="$PWD:/workspace:Z"
fi

if [ "$STOP_ONLY" = true ]; then
  echo "🛑 Stopping and removing container $CONTAINER_NAME..."
  "$RUNTIME" stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
  exit 0
fi

# --- Check for required project files ---
>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455
if [ ! -f package.json ]; then
  echo "❌ package.json not found. Run from project root."
  exit 1
fi

<<<<<<< HEAD
# --- Optional node version hint ---
node_version=$(jq -r '.engines.node // empty' package.json 2>/dev/null || true)
if [ -n "$node_version" ]; then
  echo "🧠 Node version specified in package.json: $node_version"
fi

# --- Hash dependencies to trigger rebuild automatically ---
=======
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
>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455
DEP_HASH_FILE=".devcontainer/.last-deps-hash"
CURRENT_HASH=$(sha256sum package.json pnpm-lock.yaml | sha256sum | cut -d' ' -f1)
LAST_HASH="$(cat "$DEP_HASH_FILE" 2>/dev/null || echo '')"

if [[ "$CURRENT_HASH" != "$LAST_HASH" && "$FORCE_CLEAN" = false ]]; then
  echo "📦 Dependencies changed — rebuild triggered."
  REBUILD=true
fi

# --- Force clean option ---
if [ "$FORCE_CLEAN" = true ]; then
<<<<<<< HEAD
  echo "🧹 Removing container, image, and volumes..."
  podman rm -f "$CONTAINER_NAME" 2>/dev/null || true
  podman rmi -f "$IMAGE_NAME" 2>/dev/null || true
  podman volume rm -f "$NODE_VOLUME" "$STORE_VOLUME" 2>/dev/null || true
=======
  echo "🧹 Forcing clean build: removing image and container..."
  "$RUNTIME" rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  "$RUNTIME" rmi -f "$IMAGE_NAME"    >/dev/null 2>&1 || true
>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455
fi

# --- Ensure volumes exist ---
podman volume inspect "$NODE_VOLUME" >/dev/null 2>&1 || podman volume create "$NODE_VOLUME" >/dev/null
podman volume inspect "$STORE_VOLUME" >/dev/null 2>&1 || podman volume create "$STORE_VOLUME" >/dev/null

# --- Build image ---
if [ "$REBUILD" = true ] || [ "$FORCE_CLEAN" = true ]; then
  echo "📦 Building development image..."
<<<<<<< HEAD
  podman build -f .devcontainer/Containerfile -t "$IMAGE_NAME" "$BUILD_CONTEXT"
=======
  "$RUNTIME" build \
    -f .devcontainer/Containerfile \
    --target dev \
    -t "$IMAGE_NAME" \
    "$BUILD_CONTEXT"

>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455
  echo "$CURRENT_HASH" > "$DEP_HASH_FILE"
else
  echo "📦 Using existing development image."
fi

# --- Run container ---
echo "🚀 Running development container at $APP_URL..."
<<<<<<< HEAD
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
=======
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
>>>>>>> 8bcfc9794468e61596aa1923230b19afdcd07455
