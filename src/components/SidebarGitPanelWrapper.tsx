import { SidebarGitPanel } from './SidebarGitPanel'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'
import { isLikelyGitAuthError, normalizeGitState } from '../lib/gitUtils'

interface SidebarGitPanelWrapperProps {
  isCompactLayout: boolean
  onSyncRepository: () => Promise<void>
  onOpenCommitDialog: () => void
  onPullChanges: () => Promise<void>
  onOpenMergeDialog: () => void
  onFetchChanges: () => Promise<void>
  onRefreshGitState: (fetchRemote?: boolean) => Promise<void>
  onResolveConflictChoice: (filePath: string, choice: 'ours' | 'theirs') => Promise<void>
  onOpenConflictedFile: (filePath: string) => Promise<void>
}

export function SidebarGitPanelWrapper({
  isCompactLayout,
  onSyncRepository,
  onOpenCommitDialog,
  onPullChanges,
  onOpenMergeDialog,
  onFetchChanges,
  onRefreshGitState,
  onResolveConflictChoice,
  onOpenConflictedFile,
}: SidebarGitPanelWrapperProps) {
  const { rootPath } = useWorkspace()
  const { gitState, isGitBusy, syncFeedback } = useConfig()
  const { setShowGitAuthHelp, setShowSettings } = useUI()

  const conflictedFiles = normalizeGitState(gitState).conflictedFiles
  const gitAuthErrorActive =
    isLikelyGitAuthError(gitState.error) ||
    (syncFeedback.status === 'error' && isLikelyGitAuthError(syncFeedback.message)) ||
    (syncFeedback.status === 'warning' && isLikelyGitAuthError(syncFeedback.message))

  return (
    <SidebarGitPanel
      isCompactLayout={isCompactLayout}
      rootPath={rootPath}
      gitState={gitState}
      isGitBusy={isGitBusy}
      syncFeedback={syncFeedback}
      conflictedFiles={conflictedFiles}
      gitAuthErrorActive={gitAuthErrorActive}
      onSyncRepository={onSyncRepository}
      onOpenCommitDialog={onOpenCommitDialog}
      onPullChanges={onPullChanges}
      onOpenMergeDialog={onOpenMergeDialog}
      onFetchChanges={onFetchChanges}
      onRefreshGitState={onRefreshGitState}
      onSetShowGitAuthHelp={setShowGitAuthHelp}
      onSetShowSettings={setShowSettings}
      onResolveConflictChoice={onResolveConflictChoice}
      onOpenConflictedFile={onOpenConflictedFile}
    />
  )
}
