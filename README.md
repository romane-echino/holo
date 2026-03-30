# Holo

Holo is a desktop Markdown editor inspired by Microsoft Loop, designed for fast writing and simple Git/GitHub synchronization.

## What is Holo?

Holo is built for teams who want a smooth writing experience without leaving a file-based workflow.

It combines:

- a modern desktop UI,
- RAW and WYSIWYG editing,
- Markdown-first storage,
- built-in Git operations for everyday sync.

## Key Features

- Open and browse local Markdown folders
- Multi-tab editing with unsaved state indicators
- RAW mode and WYSIWYG mode switch
- Editable document header (title, description, author)
- Loop-style interactions (`/` commands, inline selection toolbar, markdown shortcuts)
- Save with button or `Ctrl+S` / `Cmd+S`
- Built-in Git status, commit, pull, merge, and sync flow

## Releases

Holo publishes desktop builds through GitHub Releases for:

- Windows (`.exe`)
- macOS (`.dmg`, `.zip`)
- Linux Debian (`.deb`)

Release workflow: [.github/workflows/release.yml](.github/workflows/release.yml)

Trigger a release by pushing a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Signing / Notarization (optional)

If you want signed builds in CI, configure these GitHub Action secrets:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## Quick Start (local)

Prerequisites:

- Node.js (LTS recommended)
- npm

Install:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Build renderer:

```bash
npm run build
```

## Project Status

Roadmap and delivery tracking are maintained in [Process.md](Process.md).
