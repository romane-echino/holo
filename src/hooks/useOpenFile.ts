import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { getBaseName } from '../lib/appUtils'
import type { FilePathStats } from '../types/editor'

interface OpenTab {
  path: string
  name: string
  content: string
  isDirty: boolean
}

interface UseOpenFileParams {
  getHoloApi: () => Window['holo'] | null
  rootPath: string | null
  gitState: { isRepo: boolean; incoming: number }
  applyRemoteEditBlockFromGitState: (state: any) => void
  setRemoteEditBlock: (block: { isBlocked: boolean; message: string }) => void
  setActiveTab: Dispatch<SetStateAction<OpenTab | null>>
  setPathStatsByPath: Dispatch<SetStateAction<Record<string, FilePathStats>>>
  setActiveTabPath: (path: string) => void
  setRecentFilePaths: Dispatch<SetStateAction<string[]>>
  setShowCompactToc: (show: boolean) => void
  focusActiveEditorSoon: () => void
}

export function useOpenFile({
  getHoloApi,
  rootPath,
  gitState,
  applyRemoteEditBlockFromGitState,
  setRemoteEditBlock,
  setActiveTab,
  setPathStatsByPath,
  setActiveTabPath,
  setRecentFilePaths,
  setShowCompactToc,
  focusActiveEditorSoon,
}: UseOpenFileParams) {
  const openFile = useCallback(
    async (filePath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        // Open the file immediately using cached git state — no blocking network fetch
        if (rootPath && gitState.isRepo && gitState.incoming > 0) {
          applyRemoteEditBlockFromGitState(gitState)
        } else {
          setRemoteEditBlock({ isBlocked: false, message: '' })
        }

        const nextContent = await holo.readFile(filePath)
        const stats = await holo.getPathStats(filePath).catch(() => null)
        const nextFile: OpenTab = {
          path: filePath,
          name: getBaseName(filePath),
          content: nextContent,
          isDirty: false,
        }
        setActiveTab(nextFile)

        if (stats) {
          setPathStatsByPath((prev) => ({
            ...prev,
            [filePath]: stats,
          }))
        }

        setActiveTabPath(filePath)
        setRecentFilePaths((prev) => [filePath, ...prev.filter((path) => path !== filePath)].slice(0, 20))
        setShowCompactToc(false)
        focusActiveEditorSoon()
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [
      applyRemoteEditBlockFromGitState,
      focusActiveEditorSoon,
      getHoloApi,
      gitState,
      rootPath,
      setRemoteEditBlock,
      setActiveTab,
      setPathStatsByPath,
      setActiveTabPath,
      setRecentFilePaths,
      setShowCompactToc,
    ],
  )

  return {
    openFile,
  }
}
