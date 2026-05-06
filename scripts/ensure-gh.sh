#!/usr/bin/env bash
# Download GitHub CLI into .local/bin/gh if missing (macOS arm64; extend for linux/x64 if needed).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/.local/bin/gh"
mkdir -p "$ROOT/.local/bin"

if [ -x "$BIN" ]; then
  echo "Already present: $BIN"
  exit 0
fi

ARCH="$(uname -m)"
OS="$(uname -s)"
TAG="v2.92.0"

case "$OS-$ARCH" in
  Darwin-arm64)
    ZIP="gh_2.92.0_macOS_arm64.zip"
    ;;
  Darwin-x86_64)
    ZIP="gh_2.92.0_macOS_amd64.zip"
    ;;
  *)
    echo "Unsupported OS/arch: $OS $ARCH — install gh from https://cli.github.com" >&2
    exit 1
    ;;
esac

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -sLf -o "$TMP/dl.zip" "https://github.com/cli/cli/releases/download/${TAG}/${ZIP}"
unzip -q "$TMP/dl.zip" -d "$TMP"
GH="$(find "$TMP" -name gh -type f | head -1)"
install -m 755 "$GH" "$BIN"
echo "Installed $BIN"
"$BIN" version
