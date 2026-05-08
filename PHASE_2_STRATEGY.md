# Phase 2 Strategy: UI Component Extraction

## Objective
Decompose the 8090-line App.tsx monolith into logically independent, reusable React components while maintaining **zero behavioral changes** and build stability.

## Architecture Decision
- **State remains in App.tsx** for now (Phase 3 will introduce proper state management)
- **Components receive props only** (read-only, no direct state manipulation)
- **Callbacks passed as props** for state updates
- **Build validation after each extraction** (target: <10ms per component)

## Component Extraction Map

### 1. **AppHeader** (L5313–L5428)
**Scope**: Top navigation bar (logo, version, readonly toggle, user menu, dev tools, window controls)
- Isolated from main content state
- No dependencies on editor/file state
- Props needed:
  - `isCompactLayout`, `appVersion`, `showTypeRBadge`, `readOnlyMode`, `appAuthor`
  - `showUserMenu`, `onToggleReadOnly`, `onToggleUserMenu`, `onEditAuthor`, `onLogout`, `onDevTools`, `onMinimize`, `onMaximize`, `onClose`
- File: `src/components/AppHeader.tsx`

### 2. **AppSidebar** (L5429–L5500)
**Scope**: Left navigation panel (file/folder/template/git icons + badges)
- Renders root folder icon + template icon + git status
- Props needed:
  - `isCompactLayout`, `isSidebarOpenOnCompact`, `templateCount`, `gitState`, `isDirty`
  - `onToggleSidebar`, `onSelectPanel(panelType)`
- File: `src/components/AppSidebar.tsx`

### 3. **MainModals** (L7549–7982)
**Scope**: All 6 modal dialogs (Changelog, UnsavedChanges, Confirm, Link, GitAuth, NameDialog, CloneDialog, GitDialog, UpdateAvailable)
- Extract as single component to reduce JSX bulk
- Props:
  - All modal state flags (`showChangelogModal`, `confirmDialog`, `linkDialog`, etc.)
  - All modal callbacks (`onCloseChangelog`, `onConfirmChange`, `submitLinkDialog`, etc.)
- File: `src/components/MainModals.tsx`

### 4. **EditorPanel** (L6058–6350+)
**Scope**: Main editor area (header, markdown content, tabs, right panel)
- Largest remaining JSX section
- Props needed:
  - All editor state (content, selections, editableHeader, tabs)
  - All editor callbacks (onChange, onSelectTab, onUpdateTag, etc.)
- File: `src/components/EditorPanel.tsx`

### 5. **SidePanel Components** (Status, Outline, Assets)
**Scope**: Three collapsible right panels (L5518–6011)
- Extract individually for testability
- Props: state + callbacks per panel
- Files:
  - `src/components/StatusPanel.tsx`
  - `src/components/OutlinePanel.tsx`
  - `src/components/AssetsPanel.tsx`

## Extraction Sequence

1. **AppHeader** — easiest, no editor state
2. **AppSidebar** — simple state delegation
3. **MainModals** — reduces App.tsx line count significantly
4. **EditorPanel** — tackle bulk, then extract sub-sections
5. **Side panels** — once main structure is clean

## Validation Strategy

After each extraction:
```bash
npm run build  # Ensure compile success and no regression
grep "Props needed missing" src/App.tsx  # Check all callbacks passed
wc -l src/App.tsx  # Track line reduction
```

## Expected Outcomes

| Stage | File | Lines Before | Lines After | Time |
|---|---|---|---|---|
| Initial | App.tsx | 8090 | - | - |
| + AppHeader | AppHeader.tsx | 8090 - 120 = 7970 | - | 5 min |
| + AppSidebar | AppSidebar.tsx | 7970 - 85 = 7885 | - | 5 min |
| + MainModals | MainModals.tsx | 7885 - 850 = 7035 | - | 15 min |
| + EditorPanel | EditorPanel.tsx | 7035 - 1000 = 6035 | - | 20 min |
| Final | All files | 6035 (App) | +2055 (components) | ~45 min |

## Post-Phase-2 State

- App.tsx reduced from 8090→6035 lines
- 5+ focused component files
- Zero behavioral changes
- Full test coverage maintained
- Ready for Phase 3: State management refactor

## Notes
- Do NOT extract context/providers (Phase 3)
- Do NOT refactor hook order (maintain current flow)
- Do NOT change any callback signatures
- Preserve all comments and debug statements
