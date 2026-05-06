#!/usr/bin/env bash
# Usage: ./scripts/replace-repo-meta.sh YOUR_USER YOUR_REPO
set -euo pipefail
if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  echo "Usage: $0 <github_username_or_org> <repo_name>" >&2
  exit 1
fi
USER="$1"
REPO="$2"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
perl -pi -e "s/YOUR_GITHUB_USERNAME/${USER}/g; s/YOUR_REPO_NAME/${REPO}/g" \
  "$ROOT/package.json" \
  "$ROOT/README.md"
