import type { ReactNode } from 'react'
import { EditorContext } from './EditorContext'
import { WorkspaceContext } from './WorkspaceContext'
import { UIContext } from './UIContext'
import { ConfigContext } from './ConfigContext'
import { EditorOverlayContext } from './EditorOverlayContext'
import { useAppState } from '../hooks/useAppState'
import { useEditorOverlayState } from '../hooks/useEditorOverlayState'

interface AppStateProviderProps {
  children: ReactNode
}

/**
 * Master provider that wraps EditorContext, WorkspaceContext, UIContext, and ConfigContext
 * Initializes all state management via useAppState hook
 * Allows progressive migration of components to use contexts
 */
export function AppStateProvider({ children }: AppStateProviderProps) {
  const { editorContext, workspaceContext, uiContext, configContext } = useAppState()
  const editorOverlayState = useEditorOverlayState()

  return (
    <EditorContext.Provider value={editorContext}>
      <WorkspaceContext.Provider value={workspaceContext}>
        <UIContext.Provider value={uiContext}>
          <ConfigContext.Provider value={configContext}>
            <EditorOverlayContext.Provider value={editorOverlayState}>
              {children}
            </EditorOverlayContext.Provider>
          </ConfigContext.Provider>
        </UIContext.Provider>
      </WorkspaceContext.Provider>
    </EditorContext.Provider>
  )
}
