# justfile — Aljama Wallet Command Suite
set shell := ["bash","-cu"]

container_name := env_var_or_default("CONTAINER_NAME","nextjs-container")
app_port       := env_var_or_default("APP_PORT","2998")

runtime := `bash -lc 'command -v podman >/dev/null 2>&1 && echo podman || (command -v docker >/dev/null 2>&1 && echo docker || echo "")'`

dev port=app_port:
	APP_PORT={{port}} ./dev.sh --detach --logs

rebuild port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --detach --logs

up port=app_port:
	APP_PORT={{port}} ./dev.sh --detach

down:
	./dev.sh --stop

stop:
	./dev.sh --stop

dev-attach port=app_port:
	APP_PORT={{port}} ./dev.sh --attach --logs

rebuild-attach port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --attach --logs

shell:
	bash -lc 'set -euo pipefail; R="{{runtime}}"; [ -n "$R" ] || { echo "No podman/docker"; exit 1; }; if ! "$R" ps --format "{{"{{.Names}}"}}" | grep -qx "{{container_name}}"; then echo "Starting {{container_name}} on port {{app_port}}..."; APP_PORT="{{app_port}}" ./dev.sh --detach; fi; exec "$R" exec -it "{{container_name}}" bash'

rebuild-shell port=app_port:
	APP_PORT={{port}} ./dev.sh --rebuild --detach
	just shell

logs:
	bash -lc 'R="{{runtime}}"; [ -n "$R" ] || exit 1; exec "$R" logs -f "{{container_name}}"'

status:
	bash -lc 'R="{{runtime}}"; [ -n "$R" ] || exit 1; echo "Runtime: $R"; "$R" ps | (head -n 1; grep -E "(\\s|^){{container_name}}(\\s|$$)" || true)'

ps:
	bash -lc 'R="{{runtime}}"; [ -n "$R" ] || exit 1; exec "$R" ps'

clean:
	bash -lc 'R="{{runtime}}"; [ -n "$R" ] || exit 1; echo "Cleaning with $R"; "$R" rm -f "{{container_name}}" >/dev/null 2>&1 || true; "$R" rmi -f nextjs-dev >/dev/null 2>&1 || true; "$R" volume rm -f aljama_pnpm_store aljama_node_modules aljama_next_cache >/dev/null 2>&1 || true; rm -rf .pnpm-store .devcontainer/.last-deps-hash'

preview port=app_port:
	xdg-open "http://localhost:{{port}}" || open "http://localhost:{{port}}" || echo "Could not auto-open browser."

prod port='2999' container='aljama-prod':
	APP_PORT={{port}} CONTAINER_NAME={{container}} ./prod.sh

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
	pnpm tsc --noEmit

check:
	just lint
	just typecheck

help:
	@just --list
