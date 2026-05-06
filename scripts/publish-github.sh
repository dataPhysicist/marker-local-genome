#!/usr/bin/env bash
# Create github.com/dataphysicist/marker-local-genome and push main (requires: gh, logged in).
set -euo pipefail

OWNER="dataphysicist"
REPO="marker-local-genome"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Install GitHub CLI first:"
  echo "  brew install gh"
  echo "  gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Run: gh auth login"
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "Remote 'origin' already set:"
  git remote -v
  echo "Pushing to origin..."
  git push -u origin main
  exit 0
fi

echo "Creating ${OWNER}/${REPO} and pushing..."
gh repo create "${OWNER}/${REPO}" --public --source=. --remote=origin --push --description "Marker — local-first genotype reader (browser + optional Mac app)"

echo ""
echo "Next:"
echo "  1. https://github.com/${OWNER}/${REPO}/settings/pages → Source: GitHub Actions"
echo "  2. Site (after deploy): https://${OWNER}.github.io/${REPO}/"
echo "  3. Optional DMG: git tag v1.0.0 && git push origin v1.0.0"
