# justfile — Aljama Wallet Command Suite
set shell := ["bash","-cu"]

container_name := env_var_or_default("CONTAINER_NAME","nextjs-container")
app_port       := env_var_or_default("APP_PORT","2998")

# --- Core ---
dev port='2998':
	APP_PORT={{port}} ./dev.sh --detach --logs

rebuild port='2998':
	APP_PORT={{port}} ./dev.sh --rebuild --detach --logs

up port='2998':
	APP_PORT={{port}} ./dev.sh --detach

down: stop

stop:
	./dev.sh --stop


# --- Muscle memory modes ---
# Foreground logs in same terminal (Ctrl+C stops container because dev.sh uses --rm)
dev-attach port='2998':
	APP_PORT={{port}} ./dev.sh --attach

rebuild-attach port='2998':
	APP_PORT={{port}} ./dev.sh --rebuild --attach

# Drop into a shell in the container (container must already be running)
shell:
	bash -lc 'set -euo pipefail; \
	if command -v podman >/dev/null 2>&1; then R=podman; \
	elif command -v docker >/dev/null 2>&1; then R=docker; \
	else echo "No podman or docker found"; exit 1; fi; \
	if ! "$R" inspect "{{container_name}}" >/dev/null 2>&1; then \
	  echo "Container missing. Starting {{container_name}} on port {{app_port}}..."; \
	  APP_PORT="{{app_port}}" ./dev.sh --detach; \
	fi; \
	if ! "$R" ps | grep -q "{{container_name}}"; then \
	  echo "Container exists but not running. Starting..."; \
	  APP_PORT="{{app_port}}" ./dev.sh --detach; \
	fi; \
	exec "$R" exec -it "{{container_name}}" bash'

# Rebuild + then open an interactive shell (best for debugging install / prisma / env)
# Uses dev.sh's built-in --shell behavior when container is running; so we start detached first, then exec.
rebuild-shell port='2998':
	APP_PORT={{port}} ./dev.sh --rebuild --detach
	APP_PORT={{port}} just shell

# --- Ops ---
# 🐳 View live logs
logs:
	if command -v podman >/dev/null 2>&1; then podman logs -f "{{container_name}}"; else docker logs -f "{{container_name}}"; fi

# Quick status (is container running?)
status:
	bash -lc 'set -euo pipefail; \
	if command -v podman >/dev/null 2>&1; then R=podman; \
	elif command -v docker >/dev/null 2>&1; then R=docker; \
	else echo "No podman or docker found"; exit 1; fi; \
	echo "Runtime: $R"; \
	"$R" ps | (head -n 1; grep -E "(\s|^){{container_name}}(\s|$$)" || true)'

# List containers (helps when name differs)
ps:
	if command -v podman >/dev/null 2>&1; then podman ps; else docker ps; fi


# 🧼 Nuke dev container + image + pnpm cache + hash
clean:
	bash -lc 'RUNTIME="${CONTAINER_RUNTIME:-}"; if [ -z "$RUNTIME" ]; then if command -v podman >/dev/null 2>&1; then RUNTIME=podman; elif command -v docker >/dev/null 2>&1; then RUNTIME=docker; else echo "No podman or docker found"; exit 1; fi; fi; echo "Cleaning with $RUNTIME"; "$RUNTIME" rm -f "{{container_name}}" >/dev/null 2>&1 || true; "$RUNTIME" rmi -f nextjs-dev >/dev/null 2>&1 || true; "$RUNTIME" volume rm -f aljama_pnpm_store >/dev/null 2>&1 || true; "$RUNTIME" volume rm -f aljama_node_modules >/dev/null 2>&1 || true; rm -rf .pnpm-store .devcontainer/.last-deps-hash'

# 🌍 Open browser to dev app
preview:
	xdg-open "http://localhost:{{app_port}}" || open "http://localhost:{{app_port}}" || echo "⚠️  Could not auto-open browser."

# --- App workflows ---
# 📦 Build + run production app (uses prod.sh)
prod port='2999' container='aljama-prod':
	APP_PORT={{port}} CONTAINER_NAME={{container}} ./prod.sh

# 🔧 Prisma client generation (CRDB + PG)
prisma-generate:
	pnpm prisma generate --schema=prisma/crdb/schema.prisma
	pnpm prisma generate --schema=prisma/pg/schema.prisma

# 🧹 Lint
lint:
	pnpm lint

# ✅ Type-check (TS only; Next already runs typecheck in build)
typecheck:
	pnpm tsc --noEmit

# 🔍 Full static checks (lint + typecheck)
check:
	just lint
	just typecheck

# --- Infra (optional) ---
infra-up:
	docker-compose up -d

infra-down:
	docker-compose down

# 📜 Show help
help:
	@just --list