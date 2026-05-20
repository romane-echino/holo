import { useCallback } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useFocusActiveEditor() {
  const { editorMode, readOnlyMode } = useEditor()
  const { remoteEditBlock } = useConfig()
  const { rawEditorRef, wysiwygEditorRef } = useEditorOverlay()

  const focusActiveEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode
      const isEditorReadOnly = readOnlyMode || remoteEditBlock.isBlocked
      if (effectiveEditorMode === 'raw') {
        rawEditorRef.current?.focus()
        return
      }
      if (!isEditorReadOnly) {
        wysiwygEditorRef.current?.focus()
      }
    }, 0)
  }, [editorMode, readOnlyMode, remoteEditBlock, rawEditorRef, wysiwygEditorRef])

  return { focusActiveEditorSoon }
}
