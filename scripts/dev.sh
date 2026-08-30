#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
data_dir="$project_dir/data"
mkdir -p "$data_dir"
export GOCACHE="$project_dir/.codex_temp/go-cache"
export GOMODCACHE="$project_dir/.codex_temp/go-mod"

TIMES_DB_PATH="$data_dir/times.db" \
TIMES_ADMIN_TOKEN_PATH="$data_dir/admin.token" \
go run . &
backend_pid=$!

cleanup() {
  kill "$backend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$project_dir/frontend"
pnpm run dev
