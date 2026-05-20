import type { ReactNode } from 'react'
import { EditorContext } from './EditorContext'
import { WorkspaceContext } from './WorkspaceContext'
import { UIContext } from './UIContext'
import { ConfigContext } from './ConfigContext'
import { useAppState } from '../hooks/useAppState'

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

  return (
    <EditorContext.Provider value={editorContext}>
      <WorkspaceContext.Provider value={workspaceContext}>
        <UIContext.Provider value={uiContext}>
          <ConfigContext.Provider value={configContext}>
            {children}
          </ConfigContext.Provider>
        </UIContext.Provider>
      </WorkspaceContext.Provider>
    </EditorContext.Provider>
  )
}
