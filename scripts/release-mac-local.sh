#!/usr/bin/env bash
# Construit sur ce Mac la version macOS d'une release déjà taguée et l'ajoute
# à la release GitHub. Secours quand les machines Mac de GitHub Actions sont
# indisponibles (« The job was not acquired by Runner of type hosted… »).
#
# À lancer depuis le commit de la version (git checkout vX.Y.Z), arbre propre :
#   npm run release:mac-local
set -euo pipefail

tag="$(git describe --tags --exact-match HEAD 2>/dev/null)" || {
  echo "Erreur : HEAD n'est pas une version taguée (vX.Y.Z). Faites d'abord : git checkout vX.Y.Z"
  exit 1
}
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Erreur : des modifications ne sont pas commitées ; la version publiée doit correspondre au tag."
  exit 1
fi
version="${tag#v}"
if [[ "$(node -p "require('./package.json').version")" != "$version" ]]; then
  echo "Erreur : package.json n'est pas en version $version."
  exit 1
fi
gh release view "$tag" >/dev/null 2>&1 || {
  echo "Erreur : la release $tag n'existe pas encore sur GitHub (lancez d'abord npm run release:…)."
  exit 1
}

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

npm run build
# Même commande que la CI (npm run dist:mac), dans un dossier temporaire.
npx electron-builder --mac dmg zip --publish never -c.directories.output="$out"

shopt -s nullglob
installers=("$out"/Holo-"$version"-mac-*.dmg "$out"/Holo-"$version"-mac-*.zip)
if [[ ${#installers[@]} -eq 0 || ! -f "$out/latest-mac.yml" ]]; then
  echo "Erreur : fichiers de build introuvables dans $out."
  exit 1
fi

# Les installeurs d'abord, le fichier de mise à jour ensuite : un Mac ne voit la
# nouvelle version que lorsqu'elle est téléchargeable.
gh release upload "$tag" "${installers[@]}" --clobber
gh release upload "$tag" "$out/latest-mac.yml" --clobber
echo "Version macOS $version ajoutée à la release $tag."
