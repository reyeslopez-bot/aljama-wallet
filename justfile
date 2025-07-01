# Justfile — Aljama Wallet Command Suite

# 🧪 Start development container
dev:
    ./dev.sh

# 🔁 Rebuild dev container if dependencies change
rebuild:
    ./dev.sh --rebuild

# 🧼 Nuke and rebuild everything from scratch
clean:
    ./dev.sh --force-clean

# 🛑 Stop the running dev container
stop:
    ./dev.sh --stop

# 🌍 Open in browser
preview:
    xdg-open http://localhost:2998 || open http://localhost:2998 || echo "⚠️  Could not auto-open browser."

# 🐳 View live logs
logs:
    podman logs -f nextjs-container

# 📦 Build production app (relies on prod.sh being set up)
prod:
    ./prod.sh

# 🧱 Launch supporting infrastructure (if/when docker-compose is added)
infra-up:
    docker-compose up -d

# 🔻 Tear down supporting infrastructure
infra-down:
    docker-compose down

