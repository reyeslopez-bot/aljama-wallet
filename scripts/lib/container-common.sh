#!/usr/bin/env bash

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

append_array_item() {
  local array_name="$1"
  local value="$2"
  local quoted

  printf -v quoted '%q' "$value"
  eval "$array_name+=($quoted)"
}

load_env_exports() {
  local validate_no_space="${1:-false}"
  shift || true

  local file
  for file in "$@"; do
    [ -f "$file" ] || continue

    if [ "$validate_no_space" = "true" ] && grep -qE '^[A-Z0-9_]+=\s+' "$file"; then
      fail "Invalid $(basename "$file") format: spaces after '='"
    fi

    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  done
}

detect_container_runtime() {
  local explicit_runtime="${1:-${CONTAINER_RUNTIME:-}}"

  if [ -n "$explicit_runtime" ]; then
    command -v "$explicit_runtime" >/dev/null 2>&1 || fail "Runtime '$explicit_runtime' not found"
    printf '%s\n' "$explicit_runtime"
    return 0
  fi

  if command -v podman >/dev/null 2>&1; then
    printf '%s\n' podman
  elif command -v docker >/dev/null 2>&1; then
    printf '%s\n' docker
  else
    fail "Install podman or docker"
  fi
}

ensure_runtime_ready() {
  local runtime="$1"

  [ "$runtime" = "podman" ] || return 0

  if ! "$runtime" info >/dev/null 2>&1; then
    if "$runtime" machine list >/dev/null 2>&1; then
      echo "Podman not running; starting podman machine..."
      "$runtime" machine start
    fi
  fi

  if ! "$runtime" info >/dev/null 2>&1; then
    fail "Cannot connect to Podman. Try: podman machine start"
  fi
}

validate_port() {
  local port="$1"

  if ! [[ "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
    fail "Invalid port '$port'"
  fi
}

container_exists() {
  local runtime="$1"
  local container_name="$2"

  "$runtime" ps -a --format '{{.Names}}' | grep -qx "$container_name"
}

container_running() {
  local runtime="$1"
  local container_name="$2"

  "$runtime" ps --format '{{.Names}}' | grep -qx "$container_name"
}

append_env_file_args() {
  local array_name="$1"
  shift || true

  local file
  for file in "$@"; do
    [ -f "$file" ] || continue
    append_array_item "$array_name" "--env-file"
    append_array_item "$array_name" "$file"
  done
}

host_alias_for_runtime() {
  local runtime="$1"

  if [ "$runtime" = "docker" ]; then
    printf '%s\n' host.docker.internal
  else
    printf '%s\n' host.containers.internal
  fi
}

rewrite_localhost_url() {
  local url="$1"
  local host_alias="$2"

  url="${url/localhost/${host_alias}}"
  url="${url/127.0.0.1/${host_alias}}"
  printf '%s\n' "$url"
}

append_localhost_env_overrides() {
  local array_name="$1"
  local host_alias="$2"
  shift 2 || true

  local var_name
  local value
  local rewritten

  for var_name in "$@"; do
    value="${!var_name:-}"
    [ -n "$value" ] || continue

    if [[ "$value" == *"localhost"* || "$value" == *"127.0.0.1"* ]]; then
      rewritten="$(rewrite_localhost_url "$value" "$host_alias")"
      append_array_item "$array_name" "-e"
      append_array_item "$array_name" "${var_name}=${rewritten}"
    fi
  done
}

show_running_container_status() {
  local runtime="$1"
  local container_name="$2"

  echo "Runtime: $runtime"
  "$runtime" ps --format $'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
    | awk -F '\t' -v name="$container_name" 'NR == 1 || $1 == name'
}

remove_container_if_exists() {
  local runtime="$1"
  local container_name="$2"

  "$runtime" rm -f "$container_name" >/dev/null 2>&1 || true
}

tail_container_logs() {
  local runtime="$1"
  local container_name="$2"

  exec "$runtime" logs -f "$container_name"
}

exec_container_shell() {
  local runtime="$1"
  local container_name="$2"

  exec "$runtime" exec -it "$container_name" bash
}
