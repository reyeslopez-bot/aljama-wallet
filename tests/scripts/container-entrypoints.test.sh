#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_BASE="${TMPDIR:-/tmp}"
TMP_BASE="${TMP_BASE%/}"
TEST_TMPDIR="$(mktemp -d "$TMP_BASE/aljama-shell-tests-XXXXXX")"
trap 'rm -rf "$TEST_TMPDIR"' EXIT INT TERM

write_fake_runtime() {
  local fake_bin_dir="$1"
  local runtime_name="$2"
  local runtime_path="$fake_bin_dir/$runtime_name"

  mkdir -p "$fake_bin_dir"

  cat >"$runtime_path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

runtime_name="$(basename "$0")"
log_file="${FAKE_RUNTIME_LOG:?}"
state_dir="${FAKE_RUNTIME_STATE_DIR:?}"
all_file="$state_dir/all-containers"
running_file="$state_dir/running-containers"
info_state_file="$state_dir/${runtime_name}-info-state"

mkdir -p "$state_dir"
touch "$all_file" "$running_file"

log_call() {
  printf '%s\n' "$runtime_name $*" >>"$log_file"
}

contains_name() {
  local file="$1"
  local name="$2"

  grep -Fxq "$name" "$file"
}

add_name() {
  local file="$1"
  local name="$2"

  if ! contains_name "$file" "$name"; then
    printf '%s\n' "$name" >>"$file"
  fi
}

remove_name() {
  local file="$1"
  local name="$2"

  awk -v target="$name" '$0 != target' "$file" >"$file.tmp"
  mv "$file.tmp" "$file"
}

emit_ps() {
  local source_file="$1"
  local format="${2:-}"

  if [ "$format" = "{{.Names}}" ]; then
    cat "$source_file"
    return 0
  fi

  printf 'NAMES\tSTATUS\tPORTS\n'
  while IFS= read -r container_name; do
    [ -n "$container_name" ] || continue
    printf '%s\tUp fake\t127.0.0.1\n' "$container_name"
  done <"$source_file"
}

handle_info() {
  local mode="${FAKE_RUNTIME_INFO_MODE:-ok}"
  local state

  case "$mode" in
    ok)
      exit 0
      ;;
    fail)
      exit 125
      ;;
    recover-after-machine-start)
      state="$(cat "$info_state_file" 2>/dev/null || true)"
      if [ "$state" = "started" ]; then
        exit 0
      fi
      exit 125
      ;;
    *)
      printf 'Unsupported FAKE_RUNTIME_INFO_MODE=%s\n' "$mode" >&2
      exit 1
      ;;
  esac
}

command_name="${1:-}"
if [ $# -gt 0 ]; then
  shift
fi

log_call "$command_name $*"

case "$command_name" in
  info)
    handle_info
    ;;
  machine)
    case "${1:-}" in
      list)
        exit 0
        ;;
      start)
        printf 'started' >"$info_state_file"
        exit 0
        ;;
    esac
    ;;
  ps)
    format=""
    all="false"
    while (($#)); do
      case "$1" in
        -a)
          all="true"
          shift
          ;;
        --format)
          format="${2:-}"
          shift 2
          ;;
        *)
          shift
          ;;
      esac
    done

    if [ "$all" = "true" ]; then
      emit_ps "$all_file" "$format"
    else
      emit_ps "$running_file" "$format"
    fi
    ;;
  rm)
    while (($#)); do
      case "$1" in
        -f)
          shift
          ;;
        *)
          remove_name "$all_file" "$1"
          remove_name "$running_file" "$1"
          shift
          ;;
      esac
    done
    ;;
  rmi)
    exit 0
    ;;
  volume)
    exit 0
    ;;
  build)
    exit 0
    ;;
  run)
    container_name=""
    while (($#)); do
      case "$1" in
        --name)
          container_name="${2:-}"
          shift 2
          ;;
        --env-file|-e|-p|-v|--volume|--user|--userns|--add-host|-w)
          shift 2
          ;;
        --rm|-d|-it)
          shift
          ;;
        bash|start-single-node)
          break
          ;;
        *)
          shift
          ;;
      esac
    done

    if [ -n "$container_name" ]; then
      add_name "$all_file" "$container_name"
      add_name "$running_file" "$container_name"
    fi
    exit 0
    ;;
  start)
    for container_name in "$@"; do
      add_name "$all_file" "$container_name"
      add_name "$running_file" "$container_name"
    done
    ;;
  stop)
    for container_name in "$@"; do
      remove_name "$running_file" "$container_name"
    done
    ;;
  exec)
    exit 0
    ;;
  logs)
    printf 'fake logs\n'
    exit 0
    ;;
  *)
    printf 'Unsupported fake runtime command: %s\n' "$command_name" >&2
    exit 1
    ;;
esac
EOF

  chmod +x "$runtime_path"
}

prepare_workspace() {
  local workspace="$1"

  mkdir -p "$workspace/.devcontainer" "$workspace/scripts/lib" "$workspace/infra/runtime"
  cp "$ROOT_DIR/dev.sh" "$workspace/dev.sh"
  cp "$ROOT_DIR/prod.sh" "$workspace/prod.sh"
  cp "$ROOT_DIR/db.sh" "$workspace/db.sh"
  cp "$ROOT_DIR/justfile" "$workspace/justfile"
  cp "$ROOT_DIR/scripts/dev-bootstrap.sh" "$workspace/scripts/dev-bootstrap.sh"
  cp "$ROOT_DIR/.devcontainer/Containerfile" "$workspace/.devcontainer/Containerfile"
  cp "$ROOT_DIR/scripts/lib/container-common.sh" "$workspace/scripts/lib/container-common.sh"
  printf '{ "name": "fixture" }\n' >"$workspace/package.json"
  printf 'lockfileVersion: 9\n' >"$workspace/pnpm-lock.yaml"
  printf 'packages:\n' >"$workspace/pnpm-workspace.yaml"
  printf 'registry=https://registry.npmjs.org/\n' >"$workspace/.npmrc"
  chmod +x "$workspace/dev.sh" "$workspace/prod.sh" "$workspace/db.sh" "$workspace/scripts/dev-bootstrap.sh"
}

assert_log_contains() {
  local log_file="$1"
  local expected="$2"

  if ! grep -Fq -- "$expected" "$log_file"; then
    printf 'Expected log to contain: %s\n' "$expected" >&2
    printf 'Actual log:\n' >&2
    sed 's/^/  /' "$log_file" >&2
    exit 1
  fi
}

assert_log_lacks() {
  local log_file="$1"
  local unexpected="$2"

  if grep -Fq -- "$unexpected" "$log_file"; then
    printf 'Did not expect log to contain: %s\n' "$unexpected" >&2
    printf 'Actual log:\n' >&2
    sed 's/^/  /' "$log_file" >&2
    exit 1
  fi
}

run_in_workspace() {
  local workspace="$1"
  shift

  (
    cd "$workspace"
    PATH="$workspace/fake-bin:$PATH" "$@"
  )
}

test_dev_rewrites_env_local_and_tails_logs() {
  local workspace="$TEST_TMPDIR/dev-rewrite"
  local log_file="$workspace/runtime.log"

  prepare_workspace "$workspace"
  mkdir -p "$workspace/fake-bin" "$workspace/state"
  write_fake_runtime "$workspace/fake-bin" podman
  printf 'AUTH_MODE=memory\n' >"$workspace/.env"
  cat >"$workspace/.env.local" <<'EOF'
NEXT_PUBLIC_APP_NAME=Aljama Wallet
PG_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aljama_wallet
CRDB_DATABASE_URL=postgresql://root@127.0.0.1:26257/aljama_wallet?sslmode=disable
EOF

  FAKE_RUNTIME_LOG="$log_file" \
  FAKE_RUNTIME_STATE_DIR="$workspace/state" \
  FAKE_RUNTIME_INFO_MODE="ok" \
  run_in_workspace "$workspace" env CONTAINER_RUNTIME=podman APP_PORT=3010 ./dev.sh --rebuild --detach --logs

  assert_log_contains "$log_file" "podman build -f .devcontainer/Containerfile --target dev -t nextjs-dev ."
  assert_log_contains "$log_file" "podman run --rm -d --name nextjs-container"
  assert_log_contains "$log_file" "--env-file $workspace/.env --env-file $workspace/.env.local"
  assert_log_contains "$log_file" "-e NEXTAUTH_DEV_SECRET=aljama-dev-nextauth-secret"
  assert_log_contains "$log_file" "-e PG_DATABASE_URL=postgresql://postgres:postgres@host.containers.internal:5432/aljama_wallet -e CRDB_DATABASE_URL=postgresql://root@host.containers.internal:26257/aljama_wallet?sslmode=disable"
  assert_log_contains "$log_file" "bash /workspace/scripts/dev-bootstrap.sh"
  assert_log_contains "$log_file" "podman logs -f nextjs-container"
  assert_log_lacks "$log_file" "corepack enable"
}

test_dev_shell_reuses_running_container() {
  local workspace="$TEST_TMPDIR/dev-shell"
  local log_file="$workspace/runtime.log"

  prepare_workspace "$workspace"
  mkdir -p "$workspace/fake-bin" "$workspace/state"
  write_fake_runtime "$workspace/fake-bin" docker
  printf 'NEXTAUTH_SECRET=test-secret\n' >"$workspace/.env"
  printf 'nextjs-container\n' >"$workspace/state/all-containers"
  printf 'nextjs-container\n' >"$workspace/state/running-containers"

  FAKE_RUNTIME_LOG="$log_file" \
  FAKE_RUNTIME_STATE_DIR="$workspace/state" \
  FAKE_RUNTIME_INFO_MODE="ok" \
  run_in_workspace "$workspace" env CONTAINER_RUNTIME=docker ./dev.sh --shell

  assert_log_contains "$log_file" "docker ps --format {{.Names}}"
  assert_log_contains "$log_file" "docker exec -it nextjs-container bash"
  assert_log_lacks "$log_file" "docker run --rm"
  assert_log_lacks "$log_file" "docker build"
}

test_prod_uses_shared_runtime_and_env_loading() {
  local workspace="$TEST_TMPDIR/prod"
  local log_file="$workspace/runtime.log"

  prepare_workspace "$workspace"
  mkdir -p "$workspace/fake-bin" "$workspace/state"
  write_fake_runtime "$workspace/fake-bin" docker
  printf 'NEXTAUTH_SECRET=test-secret\nAPP_URL=http://localhost:4550\n' >"$workspace/.env.local"

  FAKE_RUNTIME_LOG="$log_file" \
  FAKE_RUNTIME_STATE_DIR="$workspace/state" \
  FAKE_RUNTIME_INFO_MODE="ok" \
  run_in_workspace "$workspace" env CONTAINER_RUNTIME=docker APP_PORT=4550 ./prod.sh --runtime docker --image-name prod-image --container-name prod-container

  assert_log_contains "$log_file" "docker build -f .devcontainer/Containerfile --target prod -t prod-image ."
  assert_log_contains "$log_file" "docker run --rm -d --name prod-container -p 4550:4550 -e PORT=4550 -e HOSTNAME=0.0.0.0"
  assert_log_contains "$log_file" "--env-file $workspace/.env.local"
  assert_log_contains "$log_file" "-v $workspace/infra/runtime:/runtime prod-image"
}

test_db_boots_after_starting_podman_machine() {
  local workspace="$TEST_TMPDIR/db"
  local log_file="$workspace/runtime.log"

  prepare_workspace "$workspace"
  mkdir -p "$workspace/fake-bin" "$workspace/state"
  write_fake_runtime "$workspace/fake-bin" podman

  FAKE_RUNTIME_LOG="$log_file" \
  FAKE_RUNTIME_STATE_DIR="$workspace/state" \
  FAKE_RUNTIME_INFO_MODE="recover-after-machine-start" \
  run_in_workspace "$workspace" env CONTAINER_RUNTIME=podman ./db.sh up

  assert_log_contains "$log_file" "podman info "
  assert_log_contains "$log_file" "podman machine start"
  assert_log_contains "$log_file" "podman run -d --name aljama-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=aljama_wallet -p 0.0.0.0:5432:5432 -v aljama_pg_data:/var/lib/postgresql/data docker.io/library/postgres:16"
  assert_log_contains "$log_file" "podman run -d --name aljama-cockroach -p 0.0.0.0:26257:26257 -p 0.0.0.0:8080:8080 -v aljama_crdb_data:/cockroach/cockroach-data docker.io/cockroachdb/cockroach:v24.1.3 start-single-node --insecure --http-addr=0.0.0.0:8080 --store=/cockroach/cockroach-data"
  assert_log_contains "$log_file" "podman exec aljama-cockroach cockroach sql --insecure --host=localhost -e CREATE DATABASE IF NOT EXISTS aljama_wallet;"
}

test_just_recipes_delegate_to_dev_script() {
  local workspace="$TEST_TMPDIR/just"
  local dry_run_output="$workspace/just-dry-run.txt"

  prepare_workspace "$workspace"

  (
    cd "$workspace"
    just --dry-run shell logs status clean >"$dry_run_output" 2>&1
  )

  assert_log_contains "$dry_run_output" "APP_PORT=2998 ./dev.sh --shell"
  assert_log_contains "$dry_run_output" "./dev.sh --logs-only"
  assert_log_contains "$dry_run_output" "./dev.sh --status"
  assert_log_contains "$dry_run_output" "./dev.sh --clean"
}

test_dev_force_clean_still_rebuilds() {
  local workspace="$TEST_TMPDIR/dev-force-clean"
  local log_file="$workspace/runtime.log"

  prepare_workspace "$workspace"
  mkdir -p "$workspace/fake-bin" "$workspace/state"
  write_fake_runtime "$workspace/fake-bin" docker
  printf 'AUTH_MODE=memory\n' >"$workspace/.env"
  printf 'old-hash\n' >"$workspace/.devcontainer/.last-deps-hash"

  FAKE_RUNTIME_LOG="$log_file" \
  FAKE_RUNTIME_STATE_DIR="$workspace/state" \
  FAKE_RUNTIME_INFO_MODE="ok" \
  run_in_workspace "$workspace" env CONTAINER_RUNTIME=docker ./dev.sh --force-clean --detach

  assert_log_contains "$log_file" "docker rmi -f nextjs-dev"
  assert_log_contains "$log_file" "docker build -f .devcontainer/Containerfile --target dev -t nextjs-dev ."
  assert_log_contains "$log_file" "docker run --rm -d --name nextjs-container"
}

test_dev_rewrites_env_local_and_tails_logs
test_dev_shell_reuses_running_container
test_prod_uses_shared_runtime_and_env_loading
test_db_boots_after_starting_podman_machine
test_just_recipes_delegate_to_dev_script
test_dev_force_clean_still_rebuilds

printf 'Shell entrypoint tests passed.\n'
