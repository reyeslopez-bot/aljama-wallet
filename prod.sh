#!/bin/bash

# 🚀 Aljama Wallet Production Runner

IMAGE_NAME="localhost/nextjs-prod"
CONTAINER_NAME="aljama-prod"
APP_PORT=2999

# --- Kill existing prod container if running
podman rm -f "$CONTAINER_NAME" 2>/dev/null || true

# --- Build production image
podman build -f .devcontainer/Containerfile -t "$IMAGE_NAME" .

# --- Run production container
podman run --rm -d --name "$CONTAINER_NAME" -p "$APP_PORT:$APP_PORT" "$IMAGE_NAME"

echo "🚀 Aljama Wallet running at http://localhost:$APP_PORT"

