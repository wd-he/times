#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
output_dir="$project_dir/build/linux"
mkdir -p "$project_dir/build"
rm -rf "$output_dir"

docker build --target binary --output "type=local,dest=$output_dir" "$project_dir"
mv "$output_dir/times" "$project_dir/build/times-linux"
rmdir "$output_dir"
chmod 0755 "$project_dir/build/times-linux"
echo "Linux 生产二进制已生成：$project_dir/build/times-linux"
