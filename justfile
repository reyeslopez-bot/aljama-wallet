set shell := ["bash", "-cu"]

# Justfile — Aljama Wallet Command Suite
set shell := ["bash", "-cu"]

# Params (override via env: CONTAINER_NAME, APP_PORT)
container_name := env_var_or_default("CONTAINER_NAME", "nextjs-container")
app_port       := env_var_or_default("APP_PORT", "2998")

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
preview:
    xdg-open http://localhost:2998 || open http://localhost:2998 || echo "⚠️  Could not auto-open browser."

# 🐳 View live logs
logs:
    podman logs -f nextjs-container

# 📦 Build production app (relies on prod.sh being set up)
prod port='2999' container='aljama-prod':
    APP_PORT={{port}} CONTAINER_NAME={{container}} ./prod.sh

# 🧱 Launch supporting infrastructure (if/when docker-compose is added)
infra-up:
    docker-compose up -d

# 🔻 Tear down supporting infrastructure
infra-down:
    docker-compose down

# 📜 Show help
help:
    @just --list
    @echo
    @echo "Usage:"
    @echo "  just <command>"
    @echo
    @echo "Examples:"
    @echo "  just dev        # Start development container"
    @echo "  just preview    # Open the app in your browser"
    @echo "  just prod       # Build production app"
    @echo
    @echo "Tip: set CONTAINER_NAME / APP_PORT env vars to override defaults."
