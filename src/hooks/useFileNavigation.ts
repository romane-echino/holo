import { useCallback } from 'react'
import type { TreeNode } from '../types/app'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'

export function useFileNavigation({
  discardTransientEditorState,
  openFile,
}: {
  discardTransientEditorState: () => void
  openFile: (filePath: string) => Promise<void>
}) {
  const { activeTab, activeTabPath } = useEditor()
  const { setSelectedPath, setSelectedType } = useWorkspace()
  const { pendingFileSwitchPath, setPendingFileSwitchPath, setShowUnsavedChangesModal } = useUI()
  const onSelectNode = useCallback(
    async (node: TreeNode) => {
      setSelectedPath(node.path)
      setSelectedType(node.type)

      if (node.type === 'file') {
        const isDirty = activeTab?.isDirty ?? false
        if (isDirty && activeTabPath && activeTabPath !== node.path) {
          setPendingFileSwitchPath(node.path)
          setShowUnsavedChangesModal(true)
          return
        }

        await openFile(node.path)
      }
    },
    [activeTab, activeTabPath, openFile, setSelectedPath, setSelectedType, setPendingFileSwitchPath, setShowUnsavedChangesModal],
  )

  const confirmDiscardAndSwitchFile = useCallback(async () => {
    if (!pendingFileSwitchPath) {
      setShowUnsavedChangesModal(false)
      return
    }

    setShowUnsavedChangesModal(false)
    discardTransientEditorState()
    const nextPath = pendingFileSwitchPath
    setPendingFileSwitchPath(null)
    await openFile(nextPath)
  }, [discardTransientEditorState, openFile, pendingFileSwitchPath, setShowUnsavedChangesModal, setPendingFileSwitchPath])

  const cancelDiscardAndSwitchFile = useCallback(() => {
    setShowUnsavedChangesModal(false)
    setPendingFileSwitchPath(null)
  }, [setShowUnsavedChangesModal, setPendingFileSwitchPath])

  return {
    onSelectNode,
    confirmDiscardAndSwitchFile,
    cancelDiscardAndSwitchFile,
  }
}
