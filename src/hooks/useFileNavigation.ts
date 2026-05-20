import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { TreeNode } from '../types/app'

type UseFileNavigationParams = {
  activeTab: { isDirty: boolean } | null
  activeTabPath: string | null
  discardTransientEditorState: () => void
  openFile: (filePath: string) => Promise<void>
  pendingFileSwitchPath: string | null
  setPendingFileSwitchPath: Dispatch<SetStateAction<string | null>>
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  setSelectedType: Dispatch<SetStateAction<'file' | 'directory' | null>>
  setShowUnsavedChangesModal: Dispatch<SetStateAction<boolean>>
}

export function useFileNavigation({
  activeTab,
  activeTabPath,
  discardTransientEditorState,
  openFile,
  pendingFileSwitchPath,
  setPendingFileSwitchPath,
  setSelectedPath,
  setSelectedType,
  setShowUnsavedChangesModal,
}: UseFileNavigationParams) {
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
