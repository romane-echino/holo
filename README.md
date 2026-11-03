# Holo

Holo is a desktop Markdown editor inspired by modern collaborative editors, built for teams that want a clean writing experience with file-based storage and simple Git sync.

## Why Holo

Holo helps non-technical users edit documentation in Markdown without dealing with terminal commands.

- Edit documents visually (WYSIWYG) or in raw Markdown
- Keep files in your own folders and repositories
- Save and sync with integrated Git actions
- Work with a fast desktop interface (Windows, macOS, Linux)

## Screenshots

Replace these placeholders with real screenshots when ready.

![Holo editor placeholder](docs/images/placeholder-editor.svg)
![Holo slash commands placeholder](docs/images/placeholder-slash-menu.svg)
![Holo git panel placeholder](docs/images/placeholder-git-panel.svg)

## Main Features

- Markdown file explorer (folders + `.md` files)
- Single-page editing flow focused on clarity
- RAW / WYSIWYG switch
- Slash commands (`/`) for quick blocks (titles, lists, tables, tasks, code, etc.)
- Inline formatting toolbar on text selection
- Editable metadata header (title, description, author, icon, tags)
- Image drag & drop / paste into documents and table cells, copy images to other apps
- Tables with typed columns, resizable widths, sorting and summaries
- Integrated search by content and tags
- Git integration: fetch, pull, commit, merge, sync
- Auto-commit flows for save and file structure changes
- Safe collaboration: edits made elsewhere (colleague, OneDrive, another window) are merged
  with yours instead of being overwritten, non-overlapping changes are reconciled
  automatically, and conflicts are resolved per change
- Minimal diffs: only the lines you actually edit change in the file

## Installation

Download the latest release for your OS:

- Windows: `.exe`
- macOS: `.dmg` or `.zip`
- Linux: `.deb`

Then install and launch Holo like any standard desktop app.

## Quick Start

1. Open Holo
2. Open a local folder containing Markdown docs
3. Select a file in the explorer
4. Edit in WYSIWYG or RAW mode
5. Press `Ctrl+S` / `Cmd+S` to save (and auto-sync when configured in Git)

## Typical Workflow

- Create, rename, move, or delete files/folders from the explorer
- Write content with slash commands and formatting shortcuts
- Use the Git panel to fetch/pull/sync when needed
- Resolve conflicts directly from the app when they appear

## Teams/Slack Share Links

To make Holo links clickable in tools like Microsoft Teams, use the HTTPS gateway hosted on Vercel:

- Gateway source is in [holo-link-gateway](holo-link-gateway)
- Deploy this folder as a separate Vercel project (root directory: `holo-link-gateway`)
- In Holo settings, fill **Application → Passerelle lien HTTPS (Teams)** with your deployed URL

When configured, the “Copier le lien” action generates a clickable HTTPS link that redirects to `holo://...`.

Links carry the repository URL (`holo://<folder>/<path>.md?remote=<repo url>`, credentials
stripped): the recipient's space is found even if their folder has another name, a document
created moments ago is fetched before opening, and an unknown repository can be cloned in one step.

> Tip: keep git repositories **outside** OneDrive/Dropbox/iCloud folders. A repository in a
> synced folder is synchronized twice (git + cloud); Holo protects your saves but warns about it.

## Tech Stack

- Electron 45 (macOS 13+, Windows 10+, Linux)
- React + TypeScript
- Vite
- Tailwind CSS

## Development

```bash
npm ci
npm run dev        # Vite + Electron
npm run lint
npm run build
npm test           # Playwright: renderer fixtures + Electron end-to-end tests
```

Electron tests launch isolated app instances (`HOLO_APP_DATA_DIR`), so they never touch your
own Holo configuration.

## Project Status

Roadmap and feedback tracking are available in [Process.md](Process.md).
