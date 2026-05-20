import { useCallback, useEffect } from 'react'
import { useEditor } from '../contexts/EditorContext'

export function useEnsureWritableMode() {
  const { readOnlyMode, setEditorMode } = useEditor()
  const ensureWritableMode = useCallback(() => {
    if (!readOnlyMode) {
      return true
    }

    window.alert('Le mode lecture seule est activé. Désactive-le pour modifier ce contenu.')
    return false
  }, [readOnlyMode])

  useEffect(() => {
    if (readOnlyMode) {
      setEditorMode('wysiwyg')
    }
  }, [readOnlyMode, setEditorMode])

  return {
    ensureWritableMode,
  }
}
