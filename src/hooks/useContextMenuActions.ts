import { useCallback } from 'react'
import type { TreeNode, NodeType } from '../types/app'

interface ContextMenuState {
  x: number
  y: number
  node: TreeNode
}

interface UseContextMenuActionsParams {
  setContextMenu: (menu: ContextMenuState | null) => void
  setSelectedPath: (path: string) => void
  setSelectedType: (type: NodeType) => void
}

export function useContextMenuActions({
  setContextMenu,
  setSelectedPath,
  setSelectedType,
}: UseContextMenuActionsParams) {
  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [setContextMenu])

  const openTreeContextMenu = useCallback((node: TreeNode, position: { x: number; y: number }) => {
    setSelectedPath(node.path)
    setSelectedType(node.type)
    setContextMenu({ x: position.x, y: position.y, node })
  }, [setSelectedPath, setSelectedType, setContextMenu])

  const runContextAction = useCallback((action: () => void) => {
    setContextMenu(null)
    action()
  }, [setContextMenu])

  return {
    closeContextMenu,
    openTreeContextMenu,
    runContextAction,
  }
}
