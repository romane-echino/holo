import { useCallback } from 'react'
import { updateMarkdownBooleanHeaderField } from '../lib/markdown'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function useToggleTemplateStatus({
  ensureWritableMode,
  getHoloApi,
  refreshTree,
  refreshGitState,
}: {
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  refreshTree: () => Promise<void>
  refreshGitState: (silent?: boolean) => Promise<void>
}) {
  const { activeTabPath, setActiveTab } = useEditor()
  const { setFileMetaByPath, setPathStatsByPath } = useWorkspace()
  const toggleTemplateStatus = useCallback(
    async (targetPath: string, nextValue: boolean) => {
      if (!ensureWritableMode()) {
        return
      }

      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        const currentContent = await holo.readFile(targetPath)
        const nextContent = updateMarkdownBooleanHeaderField(currentContent, 'template', nextValue)

        await holo.writeFile(targetPath, nextContent)

        if (activeTabPath === targetPath) {
          setActiveTab((previous) =>
            previous ? { ...previous, content: nextContent, isDirty: false } : previous,
          )
        }

        setFileMetaByPath((previous) => {
          const currentMeta = previous[targetPath] ?? { title: '', description: '', isTemplate: false }

          if (!currentMeta.title && !currentMeta.description && !nextValue) {
            const next = { ...previous }
            delete next[targetPath]
            return next
          }

          return {
            ...previous,
            [targetPath]: {
              ...currentMeta,
              isTemplate: nextValue,
            },
          }
        })

        const stats = await holo.getPathStats(targetPath).catch(() => null)
        if (stats) {
          setPathStatsByPath((previous) => ({
            ...previous,
            [targetPath]: stats,
          }))
        }

        await refreshTree()
        await refreshGitState(false)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [activeTabPath, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, setActiveTab, setFileMetaByPath, setPathStatsByPath],
  )

  return { toggleTemplateStatus }
}
