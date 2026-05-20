# Context-Driven Architecture Guide

## Overview

The application now uses React Context API to manage state across multiple domains:

- **EditorContext** - Editor state (active tab, editor mode, popups, menus)
- **WorkspaceContext** - Workspace/file tree state (paths, selected items, drag-drop)
- **UIContext** - General UI state (modals, dialogs, status indicators)
- **ConfigContext** - Configuration & secrets (git, image storage, AI keys)

All contexts are initialized via `useAppState()` hook and provided by `AppStateProvider` at the root level.

## Usage Examples

### Access Editor State
```tsx
import { useEditor } from './contexts'

export function MyComponent() {
  const { activeTab, activeTabPath, editorMode, setEditorMode } = useEditor()
  
  return (
    <div>
      {activeTab?.name} - Mode: {editorMode}
      <button onClick={() => setEditorMode('raw')}>
        Switch to Raw
      </button>
    </div>
  )
}
```

### Access Workspace State
```tsx
import { useWorkspace } from './contexts'

export function FileTree() {
  const { tree, expandedDirectories, setExpandedDirectories, selectedPath } = useWorkspace()
  
  // Toggle directory expansion
  const toggleDir = (path: string) => {
    const next = new Set(expandedDirectories)
    next.has(path) ? next.delete(path) : next.add(path)
    setExpandedDirectories(next)
  }
  
  return <>{/* render tree */}</>
}
```

### Access UI State
```tsx
import { useUI } from './contexts'

export function SettingsButton() {
  const { showSettings, setShowSettings } = useUI()
  
  return (
    <button onClick={() => setShowSettings(!showSettings)}>
      ⚙️ Settings
    </button>
  )
}
```

### Access Configuration
```tsx
import { useConfig } from './contexts'

export function ImageUploadComponent() {
  const { repoImageStorageMode, azureBlobContainerUrl } = useConfig()
  
  return (
    <div>
      Storage: {repoImageStorageMode}
      {repoImageStorageMode === 'azure' && (
        <p>Container: {azureBlobContainerUrl}</p>
      )}
    </div>
  )
}
```

## Migration Strategy

### Current State
- `App.tsx` still uses traditional `useState` hooks (2303 lines)
- `AppStateProvider` wraps the entire app and maintains state
- Contexts are **available but not yet used** by App.tsx

### Progressive Migration Path

1. **Phase 1** (Current): Contexts available globally
   - Components can start using `useEditor()`, `useWorkspace()`, `useUI()`, `useConfig()`
   - No need to refactor App.tsx immediately
   - Allows testing context architecture without major refactoring

2. **Phase 2** (Optional): Refactor sub-components
   - Migrate child components to use contexts instead of props
   - Reduces prop drilling
   - Improves code clarity

3. **Phase 3** (Optional): Refactor App.tsx
   - Replace useState calls with context hooks
   - Could potentially reduce App.tsx to ~1800-2000 lines
   - Requires careful testing due to component's size

## Benefits

✅ **Cleaner Components** - No more prop drilling for deeply nested components
✅ **Separation of Concerns** - Each context handles a specific domain
✅ **Type Safety** - Full TypeScript support with context interfaces
✅ **Gradual Adoption** - Migrate components at your own pace
✅ **Testing** - Easier to mock contexts in unit tests
✅ **Performance** - Context splitting by domain prevents unnecessary re-renders

## Context Structure

### EditorContextType
- `activeTab`, `setActiveTab` - Current open tab
- `editorMode` - 'raw' | 'wysiwyg'
- `selectionPopup`, `tablePopup`, `codeBlockPopup` - Overlay state
- `slashMenu`, `slashMenuIndex` - Slash command menu
- `showCompactToc`, `showEmojiPicker` - UI toggles
- `readOnlyMode` - Editing restrictions

### WorkspaceContextType
- `rootPath`, `tree` - File system state
- `selectedPath`, `draggedPath`, `dropTargetPath` - Selection & drag-drop
- `expandedDirectories` - Which folders are open
- `fileMetaByPath`, `folderIconByPath` - Metadata & icons
- `activeSidebar`, `filesSection` - Sidebar navigation
- `contextMenu` - Right-click menu state

### UIContextType
- `showSettings`, `showAuthorModal`, `showUserMenu` - Modal states
- `nameDialog`, `gitDialog`, `cloneDialog`, `linkDialog` - Dialog states
- `saveStatus`, `copyLinkStatus` - Operation feedback
- `seenChangelogVersion` - App state preferences

### ConfigContextType
- `appAuthor`, `gitEmail` - User config
- `gitState`, `isGitBusy`, `remoteEditBlock` - Git integration
- `repoImageStorageMode`, `s3Region`, `azureBlobContainerUrl` - Image storage
- `openaiApiKey`, `aiProvider`, `openaiPrompt` - AI configuration

## Recommendations

### For Small Features
Use contexts directly in your component - no need to maintain separate state.

### For Complex Features
Consider creating a custom hook that combines multiple context values:
```tsx
export function useEditorWithWorkspace() {
  const editor = useEditor()
  const workspace = useWorkspace()
  
  return { editor, workspace }
}
```

### For Testing
Mock `AppStateProvider` with test values:
```tsx
<EditorContext.Provider value={mockEditorContext}>
  <WorkspaceContext.Provider value={mockWorkspaceContext}>
    <YourComponent />
  </WorkspaceContext.Provider>
</EditorContext.Provider>
```

## Files Structure

```
src/contexts/
├── EditorContext.tsx       - Editor state context & hook
├── WorkspaceContext.tsx    - Workspace state context & hook
├── UIContext.tsx           - UI state context & hook
├── ConfigContext.tsx       - Configuration state context & hook
├── AppStateProvider.tsx    - Root provider
└── index.ts               - Centralized exports

src/hooks/
└── useAppState.ts         - Aggregates all useState calls
```

## Next Steps

1. **Try using a context** in one of your components
2. **Observe the benefits** - cleaner props, less drilling
3. **Expand usage** - migrate more components as needed
4. **Eventually refactor App.tsx** - when you're ready (or never - both are fine)

The architecture is designed to support gradual adoption! 🚀
