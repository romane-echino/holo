import { AppModals } from './AppModals'
import { useUI } from '../contexts/UIContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useEditor } from '../contexts/EditorContext'
import { getRelativeLinkPath, getBaseName } from '../lib/appUtils'
import type { ChangelogEntry, NameDialog, CloneDialog, GitDialog, ConfirmDialogState, LinkDialogState, TemplateOption } from '../types/shared'

interface AppModalsWrapperProps {
  showChangelogModal: boolean
  selectedChangelogEntry: ChangelogEntry | null
  appVersion: string | null
  closeChangelog: () => void
  markCurrentVersionChangelogAsSeen: () => void
  cancelDiscardAndSwitchFile: () => void
  confirmDiscardAndSwitchFile: () => Promise<void>
  confirmDialog: ConfirmDialogState | null
  resolveConfirmationDialog: (confirmed: boolean) => void
  linkPageSuggestions: string[]
  clearLinkSavedRange: () => void
  insertLinkIntoEditor: (text: string, url: string) => void
  fetchChanges: () => Promise<void>
  templateOptions: TemplateOption[]
  submitNameDialog: () => Promise<void>
  submitCloneDialog: () => Promise<void>
  pickCloneDirectory: () => Promise<void>
  submitGitDialog: () => Promise<void>
  updateAvailable: boolean
  updateReady: boolean
  updateProgress: number
  dismissUpdate: () => void
}

export function AppModalsWrapper({
  showChangelogModal,
  selectedChangelogEntry,
  appVersion,
  closeChangelog,
  markCurrentVersionChangelogAsSeen,
  cancelDiscardAndSwitchFile,
  confirmDiscardAndSwitchFile,
  confirmDialog,
  resolveConfirmationDialog,
  linkPageSuggestions,
  clearLinkSavedRange,
  insertLinkIntoEditor,
  fetchChanges,
  templateOptions,
  submitNameDialog,
  submitCloneDialog,
  pickCloneDirectory,
  submitGitDialog,
  updateAvailable,
  updateReady,
  updateProgress,
  dismissUpdate,
}: AppModalsWrapperProps) {
  const {
    showUnsavedChangesModal,
    linkDialog, setLinkDialog,
    nameDialog, setNameDialog,
    cloneDialog, setCloneDialog,
    gitDialog, setGitDialog,
    showGitAuthHelp, setShowGitAuthHelp, setShowSettings,
  } = useUI()
  const { rootPath } = useWorkspace()
  const { activeTabPath } = useEditor()

  return (
    <AppModals
      showChangelogModal={showChangelogModal}
      selectedChangelogEntry={selectedChangelogEntry}
      appVersion={appVersion}
      onCloseChangelog={closeChangelog}
      onMarkChangelogSeen={markCurrentVersionChangelogAsSeen}
      showUnsavedChangesModal={showUnsavedChangesModal}
      onCancelUnsaved={cancelDiscardAndSwitchFile}
      onConfirmUnsaved={() => { void confirmDiscardAndSwitchFile() }}
      confirmDialog={confirmDialog as ConfirmDialogState | null}
      onResolveConfirm={resolveConfirmationDialog}
      linkDialog={linkDialog as LinkDialogState | null}
      linkPageSuggestions={linkPageSuggestions}
      onSetLinkDialog={setLinkDialog as (d: LinkDialogState | null) => void}
      onClearLinkSavedRange={clearLinkSavedRange}
      onInsertLink={insertLinkIntoEditor}
      onLinkSuggestionClick={(filePath) => {
        if (!linkDialog) return
        const relativePath = getRelativeLinkPath(activeTabPath, filePath, rootPath)
        const label = getBaseName(filePath).replace(/\.md$/i, '')
        setLinkDialog({
          ...linkDialog,
          url: relativePath,
          text: (linkDialog as LinkDialogState).text.trim() ? (linkDialog as LinkDialogState).text : label,
          pageQuery: getBaseName(filePath),
        })
      }}
      activeTabPath={activeTabPath}
      rootPath={rootPath}
      getRelativeLinkPath={getRelativeLinkPath}
      getBaseName={getBaseName}
      showGitAuthHelp={showGitAuthHelp}
      onCloseGitAuthHelp={() => setShowGitAuthHelp(false)}
      onGitAuthOpenSettings={() => { setShowGitAuthHelp(false); setShowSettings(true) }}
      onGitAuthRetryFetch={() => { setShowGitAuthHelp(false); void fetchChanges() }}
      nameDialog={nameDialog as NameDialog | null}
      templateOptions={templateOptions}
      onSetNameDialog={setNameDialog as React.Dispatch<React.SetStateAction<NameDialog | null>>}
      onSubmitNameDialog={() => { void submitNameDialog() }}
      cloneDialog={cloneDialog as CloneDialog | null}
      onSetCloneDialog={setCloneDialog as React.Dispatch<React.SetStateAction<CloneDialog | null>>}
      onSubmitCloneDialog={() => { void submitCloneDialog() }}
      onPickCloneDirectory={() => { void pickCloneDirectory() }}
      gitDialog={gitDialog as GitDialog | null}
      onSetGitDialog={setGitDialog as React.Dispatch<React.SetStateAction<GitDialog | null>>}
      onSubmitGitDialog={() => { void submitGitDialog() }}
      updateAvailable={updateAvailable}
      updateReady={updateReady}
      updateProgress={updateProgress}
      onDismissUpdate={dismissUpdate}
      onInstallUpdate={() => { void window.holo?.installUpdate() }}
    />
  )
}
