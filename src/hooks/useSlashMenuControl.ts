import { useCallback } from 'react'

interface UseSlashMenuControlParams {
  setSlashMenu: (menu: null) => void
  setSlashMenuIndex: (index: number) => void
}

export function useSlashMenuControl({
  setSlashMenu,
  setSlashMenuIndex,
}: UseSlashMenuControlParams) {
  const closeSlashMenu = useCallback(() => {
    setSlashMenu(null)
    setSlashMenuIndex(0)
  }, [setSlashMenu, setSlashMenuIndex])

  return {
    closeSlashMenu,
  }
}
