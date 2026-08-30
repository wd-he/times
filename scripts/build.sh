#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$project_dir/.codex_temp/npm-cache" "$project_dir/.codex_temp/go-cache" "$project_dir/.codex_temp/go-mod" "$project_dir/build"

export npm_config_cache="$project_dir/.codex_temp/npm-cache"
export GOCACHE="$project_dir/.codex_temp/go-cache"
export GOMODCACHE="$project_dir/.codex_temp/go-mod"

cd "$project_dir/frontend"
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build

cd "$project_dir"
go test . ./internal/... ./frontend
go build -o build/times .
echo "生产产物已生成：$project_dir/build/times"
