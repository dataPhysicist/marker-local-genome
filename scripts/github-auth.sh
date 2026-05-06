#!/usr/bin/env bash
# Log in to GitHub CLI. One of:
#   - export GH_TOKEN=ghp_...  then run this script
#   - one-line file .gh-token in repo root (deleted after use; gitignored)
#   - pipe token:  printf '%s' 'ghp_...' | ./scripts/github-auth.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/scripts/ensure-gh.sh" ]; then
  "$ROOT/scripts/ensure-gh.sh" >/dev/null 2>&1 || true
fi
export PATH="$ROOT/.local/bin:$PATH"

if ! command -v gh >/dev/null 2>&1; then
  echo "Missing $ROOT/.local/bin/gh" >&2
  exit 1
fi

if gh auth status >/dev/null 2>&1; then
  echo "Already authenticated:"
  gh auth status
  exit 0
fi

if [ -n "${GH_TOKEN:-}" ]; then
  echo "$GH_TOKEN" | gh auth login --with-token
elif [ -f "$ROOT/.gh-token" ]; then
  gh auth login --with-token < "$ROOT/.gh-token"
  rm -f "$ROOT/.gh-token"
  echo "Removed .gh-token after use."
elif ! [ -t 0 ]; then
  # Token piped on stdin (no TTY)
  gh auth login --with-token
else
  echo "Usage:" >&2
  echo "  export GH_TOKEN=ghp_...   # classic PAT with 'repo' scope" >&2
  echo "  $0" >&2
  echo "Or:  printf '%s' 'ghp_...' | $0" >&2
  echo "Or:  put token in $ROOT/.gh-token (one line)" >&2
  exit 1
fi

gh auth status
