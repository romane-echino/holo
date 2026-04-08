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
  - Auto-skips already existing tags for patch/minor/major
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

inc_version() {
  local version="$1"
  local mode="$2"
  IFS='.' read -r major minor patch <<<"$version"

  case "$mode" in
    patch)
      patch=$((patch + 1))
      ;;
    minor)
      minor=$((minor + 1))
      patch=0
      ;;
    major)
      major=$((major + 1))
      minor=0
      patch=0
      ;;
    *)
      echo "Erreur: mode d'incrément invalide: $mode"
      exit 1
      ;;
  esac

  echo "${major}.${minor}.${patch}"
}

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

echo "→ Sync tags"
git fetch --tags --quiet || true

echo "→ Build"
npm run build

echo "→ Bump version ($bump)"
current_version="$(node -p "require('./package.json').version")"
resolved_version=""

if [[ "$bump" =~ ^(patch|minor|major)$ ]]; then
  candidate_version="$(inc_version "$current_version" "$bump")"
  candidate_tag="v${candidate_version}"

  while git rev-parse -q --verify "refs/tags/${candidate_tag}" >/dev/null; do
    echo "Tag ${candidate_tag} déjà existant, recherche du prochain..."
    candidate_version="$(inc_version "$candidate_version" "$bump")"
    candidate_tag="v${candidate_version}"
  done

  resolved_version="$candidate_version"
else
  if ! [[ "$bump" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Erreur: version explicite invalide: $bump"
    echo "Format attendu: X.Y.Z"
    exit 1
  fi

  if git rev-parse -q --verify "refs/tags/v${bump}" >/dev/null; then
    echo "Erreur: le tag v${bump} existe déjà."
    echo "Utilise patch/minor/major ou une version libre."
    exit 1
  fi

  resolved_version="$bump"
fi

npm version "$resolved_version" -m "chore(release): v%s"

new_version="$(node -p "require('./package.json').version")"
new_tag="v${new_version}"

echo "→ Push main"
git push origin main

echo "→ Push tag $new_tag"
git push origin "$new_tag"

echo "✅ Release prête: $new_tag"
