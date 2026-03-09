# justfile — Aljama Wallet Command Suite
set shell := ["bash","-cu"]

app_port := env_var_or_default("APP_PORT","2998")

dev port=app_port:
	APP_PORT={{port}} ./dev.sh --detach --logs

screenshottest port=app_port:
	PLAYWRIGHT_DISABLE_WEBSERVER=true PLAYWRIGHT_BASE_URL=http://localhost:{{port}} PLAYWRIGHT_VISUAL=true pnpm playwright test tests/e2e/home.frontend.spec.ts --project=chromium

screenshottest-update port=app_port:
	PLAYWRIGHT_DISABLE_WEBSERVER=true PLAYWRIGHT_BASE_URL=http://localhost:{{port}} PLAYWRIGHT_VISUAL=true pnpm playwright test tests/e2e/home.frontend.spec.ts --project=chromium --update-snapshots

rebuild port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --detach --logs

db-up:
	./db.sh up

db-down:
	./db.sh down

db-status:
	./db.sh status

db-logs:
	./db.sh logs

up port=app_port:
	APP_PORT={{port}} ./dev.sh --detach

down:
	./dev.sh --stop

stop:
	./dev.sh --stop

dev-attach port=app_port:
	APP_PORT={{port}} ./dev.sh --attach

rebuild-attach port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --attach

shell:
	APP_PORT={{app_port}} ./dev.sh --shell

rebuild-shell port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --shell

logs:
	./dev.sh --logs-only

status:
	./dev.sh --status

ps:
	bash -lc 'set -euo pipefail; source ./scripts/lib/container-common.sh; RUNTIME="$(detect_container_runtime "${CONTAINER_RUNTIME:-}")"; ensure_runtime_ready "$RUNTIME"; exec "$RUNTIME" ps'

clean:
	./dev.sh --clean

preview port=app_port:
	xdg-open "http://localhost:{{port}}" || open "http://localhost:{{port}}" || echo "Could not auto-open browser."

prod port='2999' container='aljama-prod':
	APP_PORT={{port}} CONTAINER_NAME={{container}} ./prod.sh

prod-with-worker port='2999' container='aljama-prod' worker='aljama-chain-sync-worker':
	APP_PORT={{port}} CONTAINER_NAME={{container}} WORKER_CONTAINER_NAME={{worker}} ./prod.sh --with-chain-sync-worker

prisma-generate:
	pnpm prisma generate --schema=prisma/crdb/schema.prisma
	pnpm prisma generate --schema=prisma/pg/schema.prisma

prisma-keys-pg:
	podman exec -it nextjs-container sh -lc 'cd /workspace && pnpm -s tsx -e "import { prismaPg } from \"./lib/prisma-pg\"; console.log(Object.keys(prismaPg).filter(k=>!k.startsWith(\"$\")).sort())"'
prisma-keys-crdb:
	podman exec -it nextjs-container sh -lc 'cd /workspace && pnpm -s tsx -e "import { prismaCrdb } from \"./lib/prisma-crdb\"; console.log(Object.keys(prismaCrdb).filter(k=>!k.startsWith(\"$\")).sort())"'

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

check:
	just lint
	just typecheck

ci:
	just lint
	just typecheck
	just test
	just build

help:
	@just --list
