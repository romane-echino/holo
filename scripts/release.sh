#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash ./scripts/release.sh patch
  bash ./scripts/release.sh minor
  bash ./scripts/release.sh major
  bash ./scripts/release.sh 0.1.4

Description:
  - Runs build
  - Bumps package.json + package-lock.json version
  - Commits version files
  - Creates git tag vX.Y.Z
  - Pushes commit + tag to origin/main
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
  usage
  exit 0
fi

if [[ -z "${1:-}" ]]; then
  echo "Erreur: version manquante (patch|minor|major|X.Y.Z)."
  usage
  exit 1
fi

bump="$1"

if ! command -v npm >/dev/null 2>&1; then
  echo "Erreur: npm introuvable."
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "Erreur: git introuvable."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Erreur: le repo contient des changements non commités."
  echo "Commit ou stash avant de lancer une release."
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "main" ]]; then
  echo "Erreur: tu dois être sur la branche main (branche actuelle: $current_branch)."
  exit 1
fi

echo "→ Build"
npm run build

echo "→ Bump version ($bump)"
if [[ "$bump" =~ ^(patch|minor|major)$ ]]; then
  npm version "$bump" -m "chore(release): v%s"
else
  npm version "$bump" -m "chore(release): v%s"
fi

new_version="$(node -p "require('./package.json').version")"
new_tag="v${new_version}"

echo "→ Push main"
git push origin main

echo "→ Push tag $new_tag"
git push origin "$new_tag"

echo "✅ Release prête: $new_tag"
