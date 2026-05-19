import { useEffect } from 'react'

type UseContextMenuDismissParams = {
  contextMenuOpen: boolean
  closeContextMenu: () => void
}

export function useContextMenuDismiss({
  contextMenuOpen,
  closeContextMenu,
}: UseContextMenuDismissParams) {
  useEffect(() => {
    if (!contextMenuOpen) {
      return
    }

    const onWindowBlur = () => closeContextMenu()
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeContextMenu()
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('keydown', onEscape)
    }
  }, [closeContextMenu, contextMenuOpen])
}
