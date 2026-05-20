import { createContext, useContext } from 'react'
import type { useEditorOverlayState } from '../hooks/useEditorOverlayState'

export type EditorOverlayContextType = ReturnType<typeof useEditorOverlayState>

export const EditorOverlayContext = createContext<EditorOverlayContextType | null>(null)

export function useEditorOverlay(): EditorOverlayContextType {
  const ctx = useContext(EditorOverlayContext)
  if (!ctx) throw new Error('useEditorOverlay must be used within AppStateProvider')
  return ctx
}
