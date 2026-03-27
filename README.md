# Holo

Éditeur Markdown desktop inspiré de Microsoft Loop, avec stockage local en fichiers `.md` et intégration Git/GitHub.

## Aperçu

Holo vise une expérience simple pour des utilisateurs non techniques : ouvrir un dossier, éditer un document, sauvegarder et synchroniser avec Git.

Le projet combine :

- une UI moderne type VS Code,
- un mode `RAW` et un mode `WYSIWYG`,
- des raccourcis et interactions orientées productivité,
- une base Git intégrée (sync, commit, conflit).

## Fonctionnalités principales

- Arborescence locale de fichiers/dossiers Markdown
- Édition `RAW` (textarea) + `WYSIWYG` (contentEditable)
- En-tête de document éditable (titre, description, auteur)
- Commandes rapides type Loop (`/`, raccourcis markdown, popup de sélection)
- Onglets multi-fichiers + indicateur non sauvegardé
- Sauvegarde via bouton et `Ctrl+S` / `Cmd+S`
- Intégration Git : état local/distant, commit, pull, merge, synchronisation
- Build desktop Windows/macOS/Linux

## Stack technique

- React + TypeScript
- Vite
- Electron
- Tailwind CSS v4
- Marked + Turndown (conversion HTML ↔ Markdown)

## Démarrage rapide

### Prérequis

- Node.js (LTS recommandé)
- npm

### Installation

```bash
npm install
```

### Développement (Electron + Vite)

```bash
npm run dev
```

### Build web (renderer)

```bash
npm run build
```

### Lint

```bash
npm run lint
```

## Scripts disponibles

- `npm run dev` : lance Electron + Vite en mode développement
- `npm run start` : lance l’app Electron packagée localement
- `npm run build` : build TypeScript + Vite
- `npm run lint` : exécute ESLint
- `npm run dist` : build desktop pour l’OS courant
- `npm run dist:win` : build Windows (`nsis`, `portable`)
- `npm run dist:mac` : build macOS (`dmg`, `zip`)
- `npm run dist:linux` : build Linux (`AppImage`, `tar.gz`)

## Releases GitHub (Windows / macOS / Linux)

Le workflow [release.yml](.github/workflows/release.yml) compile automatiquement les binaires sur 3 OS et publie les artefacts dans une release GitHub.

Déclenchement : push d’un tag `v*`.

Exemple :

```bash
git tag v0.1.0
git push origin v0.1.0
```

Artefacts générés dans `release/` en local et attachés à la release en CI.

## Structure du projet

```text
.
├── electron/             # Main process + preload
├── src/                  # Interface React
├── public/               # Assets packaging
├── .github/workflows/    # CI/CD (build release)
├── Process.md            # Cahier des charges / roadmap
└── package.json
```

## Roadmap

Le suivi détaillé est maintenu dans [Process.md](Process.md) (étapes, statut, backlog).

## Contribution

1. Créer une branche feature
2. Commiter des changements ciblés
3. Vérifier `npm run lint` et `npm run build`
4. Ouvrir une Pull Request

## Licence

Aucune licence déclarée pour le moment.
