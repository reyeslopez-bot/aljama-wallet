# justfile — Aljama Wallet Command Suite
set shell := ["bash","-cu"]

container_name := env_var_or_default("CONTAINER_NAME","nextjs-container")
app_port       := env_var_or_default("APP_PORT","2998")

dev port='2998':
	APP_PORT={{port}} ./dev.sh --detach --logs

rebuild port='2998':
	APP_PORT={{port}} ./dev.sh --rebuild --detach --logs

up port='2998':
	APP_PORT={{port}} ./dev.sh --detach

shell:
	if command -v podman >/dev/null 2>&1; then podman exec -it "{{container_name}}" bash; else docker exec -it "{{container_name}}" bash; fi

# 🧼 Nuke dev container + image + pnpm cache + hash
clean:
	bash -lc 'RUNTIME="${CONTAINER_RUNTIME:-}"; if [ -z "$RUNTIME" ]; then if command -v podman >/dev/null 2>&1; then RUNTIME=podman; elif command -v docker >/dev/null 2>&1; then RUNTIME=docker; else echo "No podman or docker found"; exit 1; fi; fi; echo "Cleaning with $RUNTIME"; if [ -n "$RUNTIME" ]; then "$RUNTIME" rm -f nextjs-container >/dev/null 2>&1 || true; "$RUNTIME" rmi -f nextjs-dev >/dev/null 2>&1 || true; if "$RUNTIME" volume inspect aljama_pnpm_store >/dev/null 2>&1; then "$RUNTIME" volume rm aljama_pnpm_store >/dev/null 2>&1 || true; fi; fi; rm -rf .pnpm-store .devcontainer/.last-deps-hash'

# 🛑 Stop running dev container (no rebuild)
stop:
	./dev.sh --stop

# 🌍 Open browser to dev app
preview:
	xdg-open "http://localhost:{{app_port}}" || open "http://localhost:{{app_port}}" || echo "⚠️  Could not auto-open browser."

# 🐳 View live logs
logs:
	if command -v podman >/dev/null 2>&1; then podman logs -f "{{container_name}}"; else docker logs -f "{{container_name}}"; fi

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

# 🧱 Launch supporting infra (if you add docker-compose)
infra-up:
	docker-compose up -d

# 🔻 Tear down supporting infra
infra-down:
	docker-compose down

# 📜 Show help
help:
	@just --list
