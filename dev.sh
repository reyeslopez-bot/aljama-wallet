#!/bin/bash

if ! podman image exists localhost/nextjs-dev; then
  echo "Image not found, building..."
  podman build \
    --build-arg USER_ID=$(id -u) \
    --build-arg GROUP_ID=$(id -g) \
    -t localhost/nextjs-dev \
    -f .devcontainer/Dockerfile .
else
  echo "Image exists, skipping build"
fi

podman run -it \
  --userns=keep-id \
  -v "$PWD":/workspace:z \
  -p 3000:3000 \
  localhost/nextjs-dev \
  /bin/bash

