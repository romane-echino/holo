import { useCallback, useEffect } from 'react'
import { buildAutoCommitMessage } from '../lib/appUtils'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'

export function useSaveCurrentFile({
  ensureWritableMode,
  getHoloApi,
  refreshGitState,
  refreshTree,
  onAfterSave,
}: {
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  refreshGitState: (silent?: boolean) => Promise<void>
  refreshTree: () => Promise<void>
  onAfterSave?: (path: string, content: string) => void
}) {
  const { activeTab, setActiveTab, readOnlyMode } = useEditor()
  const { rootPath, setPathStatsByPath } = useWorkspace()
  const { appAuthor, gitState } = useConfig()
  const { setSaveStatus } = useUI()

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
    onAfterSave?.(activeTab.path, activeTab.content)
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
    gitState.isRepo,    onAfterSave,    refreshGitState,
    refreshTree,
    rootPath,
    setActiveTab,
    setPathStatsByPath,
    setSaveStatus,
  ])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'
      if (!isSaveKey) return
      event.preventDefault()
      if (activeTab && !readOnlyMode) void saveCurrentFile()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrentFile, activeTab, readOnlyMode])

  return { saveCurrentFile }
}
