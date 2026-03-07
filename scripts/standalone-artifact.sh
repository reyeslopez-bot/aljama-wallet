#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STANDALONE_DIR="${STANDALONE_DIR:-$ROOT_DIR/.next/standalone}"
STATIC_DIR="${STATIC_DIR:-$ROOT_DIR/.next/static}"
PUBLIC_DIR="${PUBLIC_DIR:-$ROOT_DIR/public}"
PRISMA_GENERATED_DIR="${PRISMA_GENERATED_DIR:-$ROOT_DIR/prisma/generated}"
VERIFY_PATH="${STANDALONE_VERIFY_PATH:-/api/auth/config}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/standalone-artifact.sh prepare <output-dir>
  ./scripts/standalone-artifact.sh verify
  ./scripts/standalone-artifact.sh run
EOF
}

fail() {
  echo "$*" >&2
  exit 1
}

resolve_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$(pwd)/$1" ;;
  esac
}

ensure_build_outputs() {
  test -f "$STANDALONE_DIR/server.js" || fail "Missing standalone server at $STANDALONE_DIR/server.js. Run pnpm build first."
  test -d "$STATIC_DIR" || fail "Missing Next static assets at $STATIC_DIR. Run pnpm build first."
}

prepare_artifact() {
  local destination="$1"

  [ -n "$destination" ] || fail "Destination path is required."
  [ "$destination" != "/" ] || fail "Refusing to write standalone artifact to /."

  ensure_build_outputs

  rm -rf "$destination"
  mkdir -p "$destination/.next"

  cp -R "$STANDALONE_DIR"/. "$destination"/
  cp -R "$STATIC_DIR" "$destination/.next/static"

  if [ -d "$PUBLIC_DIR" ]; then
    cp -R "$PUBLIC_DIR" "$destination/public"
  fi

  if [ -d "$PRISMA_GENERATED_DIR" ]; then
    mkdir -p "$destination/prisma"
    cp -R "$PRISMA_GENERATED_DIR" "$destination/prisma/generated"
  fi

  printf '%s\n' "$destination"
}

wait_for_server() {
  local url="$1"
  local log_file="$2"
  local server_pid="$3"
  local attempt

  for attempt in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    if ! kill -0 "$server_pid" 2>/dev/null; then
      echo "Standalone server exited before becoming healthy." >&2
      cat "$log_file" >&2 || true
      return 1
    fi

    sleep 1
  done

  echo "Timed out waiting for standalone server at $url." >&2
  cat "$log_file" >&2 || true
  return 1
}

start_server() {
  local artifact_dir="$1"
  local host="$2"
  local port="$3"
  local nextauth_url="$4"
  local log_file="${5:-}"

  if [ -n "$log_file" ]; then
    (
      cd "$artifact_dir"
      HOSTNAME="$host" \
      PORT="$port" \
      NODE_ENV=production \
      NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-standalone-nextauth-secret}" \
      NEXTAUTH_URL="$nextauth_url" \
      node server.js >"$log_file" 2>&1
    )
  else
    (
      cd "$artifact_dir"
      HOSTNAME="$host" \
      PORT="$port" \
      NODE_ENV=production \
      NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-standalone-nextauth-secret}" \
      NEXTAUTH_URL="$nextauth_url" \
      node server.js
    )
  fi
}

verify_artifact() {
  local temp_dir
  local server_pid=0
  local port="${PORT:-3100}"
  local nextauth_url="${NEXTAUTH_URL:-http://127.0.0.1:${port}}"
  local verify_url="${STANDALONE_VERIFY_URL:-${nextauth_url}${VERIFY_PATH}}"
  local log_file

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/aljama-standalone-XXXXXX")"
  log_file="$temp_dir/server.log"

  cleanup() {
    if [ "$server_pid" -ne 0 ] && kill -0 "$server_pid" 2>/dev/null; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf "$temp_dir"
  }

  trap cleanup EXIT INT TERM

  prepare_artifact "$temp_dir" >/dev/null
  start_server "$temp_dir" "127.0.0.1" "$port" "$nextauth_url" "$log_file" &
  server_pid=$!

  wait_for_server "$verify_url" "$log_file" "$server_pid"
  curl -fsS "$verify_url" | grep -q '"inviteRequired"' || fail "Standalone health response from $verify_url did not include inviteRequired."
  trap - EXIT INT TERM
  cleanup
}

run_artifact() {
  local temp_dir
  local server_pid=0
  local port="${PORT:-3000}"
  local host="${HOSTNAME:-0.0.0.0}"
  local nextauth_url="${NEXTAUTH_URL:-http://127.0.0.1:${port}}"

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/aljama-standalone-XXXXXX")"

  cleanup() {
    if [ "$server_pid" -ne 0 ] && kill -0 "$server_pid" 2>/dev/null; then
      kill "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
    fi
    rm -rf "$temp_dir"
  }

  trap cleanup EXIT INT TERM

  prepare_artifact "$temp_dir" >/dev/null
  start_server "$temp_dir" "$host" "$port" "$nextauth_url" &
  server_pid=$!
  set +e
  wait "$server_pid"
  local exit_code=$?
  set -e
  trap - EXIT INT TERM
  cleanup
  return "$exit_code"
}

command="${1:-}"

case "$command" in
  prepare)
    shift || true
    output_dir="${1:-}"
    [ -n "$output_dir" ] || {
      usage >&2
      exit 1
    }
    prepare_artifact "$(resolve_path "$output_dir")"
    ;;
  verify)
    verify_artifact
    ;;
  run)
    run_artifact
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
