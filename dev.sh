#!/bin/bash

# 🌱 Aljama Wallet Dev Runner (Podman Edition)
# --------------------------------------------
# This script builds and runs the development container using Podman.
# It supports live-reload via volume mounting, auto-opens your browser,
# and provides clean/rebuild/help options for smoother development.

IMAGE_NAME="localhost/nextjs-dev"
CONTAINER_NAME="aljama-dev"
APP_PORT=2999
APP_URL="http://localhost:$APP_PORT"
WORKDIR="/workspace"
BUILD_CONTEXT="."

FORCE_CLEAN=false
REBUILD=false
CLEAN=false

# 🧭 Spinner
spinner() {
  local pid=$1
  local delay=0.1
  local spinstr='|/-\\'
  echo -n " "
  while [ -d /proc/$pid ]; do
    local temp=${spinstr#?}
    printf " [%c]  " "$spinstr"
    local spinstr=$temp${spinstr%$temp}
    sleep $delay
    printf "\b\b\b\b\b\b"
  done
  printf "    \b\b\b\b"
}

# ⏱️ Timer
timer_start() {
  SECONDS=0
}

timer_end() {
  duration=$SECONDS
  echo -e "\n⏱️  Done in ${duration}s."
}

show_help() {
  echo -e "\nUsage: ./dev.sh [--rebuild] [--force-clean] [--clean] [--help]"
  echo -e "\nOptions:"
  echo "  --rebuild       Rebuild the container image"
  echo "  --force-clean   Remove container and image fully before rebuilding"
  echo "  --clean         Remove only the container"
  echo "  --help          Show this help message"
  exit 0
}

clean_container() {
  echo "🧹 Removing container..."
  podman rm -f "$CONTAINER_NAME" &>/dev/null || echo "⚠️  No container found to remove."
}

force_clean_all() {
  echo "🔥 Full clean: removing container and image..."
  clean_container
  podman rmi "$IMAGE_NAME" &>/dev/null || echo "⚠️  No image found to remove."
}

rebuild_image() {
  echo -e "\n📦 Building dev image..."
  timer_start
  podman build \
    --build-arg USER_ID=$(id -u) \
    --build-arg GROUP_ID=$(id -g) \
    -t "$IMAGE_NAME" \
    -f .devcontainer/Containerfile "$BUILD_CONTEXT" & spinner $!
  wait
  timer_end
  echo "✅ Image built: $IMAGE_NAME"
}

open_browser() {
  echo -e "\n🌐 Trying to open: \033[1;36m$APP_URL\033[0m\n"

  if command -v xdg-open &>/dev/null; then
    echo "🧠 Found: xdg-open → launching..."
    xdg-open "$APP_URL"
  elif command -v chromium &>/dev/null; then
    echo "🌟 Found: Chromium → launching..."
    chromium "$APP_URL"
  elif command -v google-chrome &>/dev/null; then
    echo "🌟 Found: Google Chrome → launching..."
    google-chrome "$APP_URL"
  elif command -v brave &>/dev/null; then
    echo "🦁 Found: Brave Browser → launching..."
    brave "$APP_URL"
  elif command -v firefox &>/dev/null; then
    echo "🦊 Found: Firefox → launching..."
    firefox "$APP_URL"
  else
    echo -e "❌ \033[1;31mNo supported browser found.\033[0m"
    echo "🔗 Please open $APP_URL manually."
  fi
  echo ""
}

start_container() {
  echo -e "\n🚀 Starting container..."
  timer_start
  podman run -dit \
    --name "$CONTAINER_NAME" \
    --userns=keep-id \
    -v "$PWD":"$WORKDIR":z \
    -p "$APP_PORT":"$APP_PORT" \
    "$IMAGE_NAME" & spinner $!
  wait
  timer_end
  echo -e "🎉 \033[1;32mContainer launched: $CONTAINER_NAME\033[0m"
  sleep 2
  open_browser
  echo "📟 Attaching logs..."
  podman logs -f "$CONTAINER_NAME"
}

# ---- MAIN LOGIC ---- #
for arg in "$@"; do
  case "$arg" in
    --force-clean)
      FORCE_CLEAN=true
      ;;
    --rebuild)
      REBUILD=true
      ;;
    --clean)
      CLEAN=true
      ;;
    --help)
      show_help
      ;;
  esac
done

if [ "$FORCE_CLEAN" = true ]; then
  force_clean_all
elif [ "$CLEAN" = true ]; then
  clean_container
  exit 0
fi

if [ "$REBUILD" = true ]; then
  rebuild_image
elif ! podman image exists "$IMAGE_NAME"; then
  echo "📦 No image found. Building..."
  rebuild_image
else
  echo "📦 Using existing image."
fi

if podman ps --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
  echo "🔁 Container already running. Attaching logs..."
  podman logs -f "$CONTAINER_NAME"
else
  start_container
fi

