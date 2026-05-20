import { useCallback } from 'react'
import { getBaseName } from '../lib/appUtils'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConfig } from '../contexts/ConfigContext'

export function useOpenFile({
  getHoloApi,
  applyRemoteEditBlockFromGitState,
  focusActiveEditorSoon,
}: {
  getHoloApi: () => Window['holo'] | null
  applyRemoteEditBlockFromGitState: (state: any) => void
  focusActiveEditorSoon: () => void
}) {
  const { setActiveTab, setActiveTabPath } = useEditor()
  const { rootPath, setPathStatsByPath, setRecentFilePaths } = useWorkspace()
  const { gitState, setRemoteEditBlock } = useConfig()
  const { setShowCompactToc } = useEditorOverlay()
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
        const nextFile = {
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
