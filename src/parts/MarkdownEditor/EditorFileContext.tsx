/**
 * EditorFileContext — fournit le chemin du fichier actuellement édité
 * aux composants profonds comme FormatToolbar sans prop-drilling.
 */
import { createContext, useContext } from 'react'

interface EditorFileContextValue {
  currentFilePath: string | null
}

export const EditorFileContext = createContext<EditorFileContextValue>({ currentFilePath: null })

export function useEditorFilePath(): string | null {
  return useContext(EditorFileContext).currentFilePath
}
