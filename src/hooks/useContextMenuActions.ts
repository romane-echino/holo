import { useCallback } from 'react'
import type { TreeNode } from '../types/app'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function useContextMenuActions() {
  const { setContextMenu, setSelectedPath, setSelectedType } = useWorkspace()
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
