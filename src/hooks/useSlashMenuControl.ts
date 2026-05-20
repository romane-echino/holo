import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useSlashMenuControl() {
  const { setSlashMenu, setSlashMenuIndex } = useEditorOverlay()

  const closeSlashMenu = useCallback(() => {
    setSlashMenu(null)
    setSlashMenuIndex(0)
  }, [setSlashMenu, setSlashMenuIndex])

  return {
    closeSlashMenu,
  }
}

