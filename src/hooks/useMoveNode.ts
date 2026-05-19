import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { buildAutoCommitMessage, getCommitTargetPath, isSameOrChildPath } from '../lib/appUtils'

type OpenTabLike = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseMoveNodeParams = {
  appAuthor: string
  rootPath: string | null
  selectedPath: string | null
  activeTabPath: string | null
  gitRepoEnabled: boolean
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  refreshTree: () => Promise<void>
  refreshGitState: (silent?: boolean) => Promise<void>
  setActiveTab: Dispatch<SetStateAction<OpenTabLike | null>>
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  setActiveTabPath: Dispatch<SetStateAction<string | null>>
  setDraggedPath: Dispatch<SetStateAction<string | null>>
  setDropTargetPath: Dispatch<SetStateAction<string | null>>
}

export function useMoveNode({
  appAuthor,
  rootPath,
  selectedPath,
  activeTabPath,
  gitRepoEnabled,
  ensureWritableMode,
  getHoloApi,
  refreshTree,
  refreshGitState,
  setActiveTab,
  setSelectedPath,
  setActiveTabPath,
  setDraggedPath,
  setDropTargetPath,
}: UseMoveNodeParams) {
  const autoCommitStructuralChange = useCallback(
    async (commitMessage: string) => {
      if (!gitRepoEnabled || !window.holo) {
        return
      }

      try {
        await window.holo.gitCommit(commitMessage)
      } catch (error) {
        console.error('Auto-commit (structure) failed:', error)
      }
    },
    [gitRepoEnabled],
  )

  const moveNode = useCallback(
    async (sourcePath: string, targetDirectoryPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      const holo = getHoloApi()

      if (!holo || sourcePath === targetDirectoryPath || isSameOrChildPath(sourcePath, targetDirectoryPath)) {
        return
      }

      try {
        const result = await holo.movePath(sourcePath, targetDirectoryPath)
        const nextPath = result.newPath

        setActiveTab((previous) =>
          previous && isSameOrChildPath(sourcePath, previous.path)
            ? { ...previous, path: previous.path.replace(sourcePath, nextPath) }
            : previous,
        )

        if (selectedPath && isSameOrChildPath(sourcePath, selectedPath)) {
          setSelectedPath(selectedPath.replace(sourcePath, nextPath))
        }

        if (activeTabPath && isSameOrChildPath(sourcePath, activeTabPath)) {
          setActiveTabPath(activeTabPath.replace(sourcePath, nextPath))
        }

        await refreshTree()
        await refreshGitState(false)
        await autoCommitStructuralChange(
          buildAutoCommitMessage(appAuthor, 'MOVE', rootPath, nextPath, `FROM ${getCommitTargetPath(rootPath, sourcePath)}`),
        )
      } catch (error) {
        window.alert((error as Error).message)
      } finally {
        setDraggedPath(null)
        setDropTargetPath(null)
      }
    },
    [
      activeTabPath,
      appAuthor,
      autoCommitStructuralChange,
      ensureWritableMode,
      getHoloApi,
      refreshGitState,
      refreshTree,
      rootPath,
      selectedPath,
      setActiveTab,
      setActiveTabPath,
      setDraggedPath,
      setDropTargetPath,
      setSelectedPath,
    ],
  )

  return {
    moveNode,
    autoCommitStructuralChange,
  }
}
