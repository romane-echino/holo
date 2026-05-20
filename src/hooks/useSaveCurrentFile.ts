import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { buildAutoCommitMessage } from '../lib/appUtils'
import type { FilePathStats } from '../types/editor'
import type { GitState } from '../types/git'

type OpenTabLike = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseSaveCurrentFileParams = {
  activeTab: OpenTabLike | null
  appAuthor: string
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  gitState: GitState
  refreshGitState: (silent?: boolean) => Promise<void>
  refreshTree: () => Promise<void>
  rootPath: string | null
  setActiveTab: Dispatch<SetStateAction<OpenTabLike | null>>
  setPathStatsByPath: Dispatch<SetStateAction<Record<string, FilePathStats>>>
  setSaveStatus: Dispatch<SetStateAction<'idle' | 'saving' | 'synced' | 'local'>>
}

export function useSaveCurrentFile({
  activeTab,
  appAuthor,
  ensureWritableMode,
  getHoloApi,
  gitState,
  refreshGitState,
  refreshTree,
  rootPath,
  setActiveTab,
  setPathStatsByPath,
  setSaveStatus,
}: UseSaveCurrentFileParams) {
  const saveCurrentFile = useCallback(async () => {
    if (!activeTab) {
      return
    }

    if (!ensureWritableMode()) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.writeFile(activeTab.path, activeTab.content)
    const stats = await holo.getPathStats(activeTab.path).catch(() => null)
    setActiveTab((prev) => (prev ? { ...prev, isDirty: false } : prev))

    if (stats) {
      setPathStatsByPath((prev) => ({
        ...prev,
        [activeTab.path]: stats,
      }))
    }

    await refreshTree()
    await refreshGitState(false)

    // Auto-commit + push if in a Git repository
    if (gitState.isRepo) {
      setSaveStatus('saving')
      try {
        const commitMessage = buildAutoCommitMessage(appAuthor, 'UPDATE', rootPath, activeTab.path)
        const result = await holo.gitCommit(commitMessage)
        setSaveStatus(result.pushed ? 'synced' : 'local')
      } catch (error) {
        // Silent fail - file was saved successfully, commit is just a bonus
        setSaveStatus('local')
        console.error('Auto-commit failed:', error)
      } finally {
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }
  }, [
    activeTab,
    appAuthor,
    ensureWritableMode,
    getHoloApi,
    gitState.isRepo,
    refreshGitState,
    refreshTree,
    rootPath,
    setActiveTab,
    setPathStatsByPath,
    setSaveStatus,
  ])

  return { saveCurrentFile }
}
