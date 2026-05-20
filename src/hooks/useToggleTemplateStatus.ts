import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { updateMarkdownBooleanHeaderField } from '../lib/markdown'
import type { FilePathStats } from '../types/editor'
import type { FileMeta } from '../types/app'

type OpenTabLike = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseToggleTemplateStatusParams = {
  activeTabPath: string | null
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  refreshTree: () => Promise<void>
  refreshGitState: (silent?: boolean) => Promise<void>
  setActiveTab: Dispatch<SetStateAction<OpenTabLike | null>>
  setFileMetaByPath: Dispatch<SetStateAction<Record<string, FileMeta>>>
  setPathStatsByPath: Dispatch<SetStateAction<Record<string, FilePathStats>>>
}

export function useToggleTemplateStatus({
  activeTabPath,
  ensureWritableMode,
  getHoloApi,
  refreshTree,
  refreshGitState,
  setActiveTab,
  setFileMetaByPath,
  setPathStatsByPath,
}: UseToggleTemplateStatusParams) {
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
