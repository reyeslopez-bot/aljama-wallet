set shell := ["bash", "-cu"]

# Justfile — Aljama Wallet Command Suite

# 🧪 Start development container
dev port='2998':
    APP_PORT={{port}} ./dev.sh

# 🔁 Rebuild dev container if dependencies change
rebuild port='2998':
    APP_PORT={{port}} ./dev.sh --rebuild

# 🧼 Nuke and rebuild everything from scratch
clean port='2998':
    APP_PORT={{port}} ./dev.sh --force-clean

# 🛑 Stop the running dev container
stop container='nextjs-container':
    CONTAINER_NAME={{container}} ./dev.sh --stop

# 🌍 Open in browser
preview port='2998':
    url="http://localhost:{{port}}"
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$url"
    elif command -v open >/dev/null 2>&1; then
      open "$url"
    else
      echo "⚠️  Could not auto-open browser. Visit $url manually."
    fi

# 🐳 View live logs
logs container='nextjs-container':
    runtime=""
    if command -v podman >/dev/null 2>&1; then
      runtime="podman"
    elif command -v docker >/dev/null 2>&1; then
      runtime="docker"
    else
      echo "❌ Neither Podman nor Docker is installed."
      exit 1
    fi
    "$runtime" logs -f "${CONTAINER_NAME:-{{container}}}"

# 📦 Build production app (relies on prod.sh being set up)
prod port='2999' container='aljama-prod':
    APP_PORT={{port}} CONTAINER_NAME={{container}} ./prod.sh

# 🧱 Launch supporting infrastructure (if/when docker-compose is added)
infra-up:
    docker-compose up -d

# 🔻 Tear down supporting infrastructure
infra-down:
    docker-compose down

