import { useEffect } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function usePendingTitleFocus() {
  const { activeTabPath } = useEditor()
  const { pendingTitleFocusPath, setPendingTitleFocusPath, titleInputRef } = useEditorOverlay()

  useEffect(() => {
    if (!pendingTitleFocusPath || activeTabPath !== pendingTitleFocusPath) {
      return
    }

    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
      setPendingTitleFocusPath(null)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeTabPath, pendingTitleFocusPath, titleInputRef, setPendingTitleFocusPath])
}
