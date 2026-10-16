#!/usr/bin/env bash
set -euo pipefail
version=22.5.1
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64) arch=arm64 ;;
  *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
esac
tools_root="${CROSSZ_TOOLS_ROOT:-/workspace/.tools}"
node_dir="$tools_root/node-v$version-linux-$arch"
if [[ ! -x "$node_dir/bin/node" ]]; then
  mkdir -p "$tools_root"
  download_dir=$(mktemp -d)
  trap 'rm -rf "$download_dir"' EXIT
  archive="node-v$version-linux-$arch.tar.xz"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$version/SHASUMS256.txt" -o "$download_dir/SHASUMS256.txt"
  curl --fail --location --silent --show-error "https://nodejs.org/dist/v$version/$archive" -o "$download_dir/$archive"
  (cd "$download_dir"; awk -v name="$archive" '$2 == name {print}' SHASUMS256.txt > selected.sha256; test -s selected.sha256; sha256sum -c selected.sha256)
  tar -xJf "$download_dir/$archive" -C "$tools_root"
fi
"$node_dir/bin/node" --version
echo "export PATH=$node_dir/bin:\$PATH"
