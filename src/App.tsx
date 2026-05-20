import { useMemo } from 'react'
import { useEditor } from './contexts/EditorContext'
import { useWorkspace } from './contexts/WorkspaceContext'
import { useUI } from './contexts/UIContext'
import { useConfig } from './contexts/ConfigContext'
import { turndownService } from './lib/markdown'
import {
  AppHeaderWrapper, AiDialogModalWrapper, AppModalsWrapper, AppSidebar,
  EditorCanvasWrapper, EditorEmptyState, EditorOverlaysWrapper, EditorRightToc, EditorTopBarWrapper,
  AppSettingsModal, SidebarSearchPanel,
  SidebarFilesPanelWrapper, SidebarGitPanelWrapper,
  ContextMenuWrapper, FolderIconPickerWrapper,
  useTableInteractions,
} from './components'
import {
  useAppUpdates, useGitWorkflow,
  useRepoImageSettings, useGlobalConfig, useFileMetadata, useMyFilePaths,
  useNavigationSuggestions, useTemplateVariables, useCompactToc, useCompactLayout,
  useChangelogFlow, useConfirmationDialog, useTemplateOptions,
  useAiDialogSubmission, useNameDialogActions, usePathTargetActions,
  useCloneWorkflow, useGitDialogActions, useWorkspaceUiActions, useEditorUiCallbacks,
  useWorkspaceFolders, useSearchWorkflow, useAiProviderClient, useRecentFolderIcons,
  useWysiwygBlockHelpers, useEditorImageDrag, useSlashCommandExecutor, useWysiwygKeyDown,
  useImageUploadHandler, useCodeBlockFormatter, useEditorLinkInsertion,
  useWysiwygInputHandler,
  useEditorSelectionPopup, useEditorOverlayEffects, useContextMenuDismiss, useMoveNode,
  useNameDialogSubmission,
  useGetHoloApi, useFocusActiveEditor, useEnsureWritableMode, useDiscardTransientEditorState,
  useRefreshActiveTabFromDisk, useToggleDirectory, useOpenFile, useOpenEditorLink,
  useFileNavigation, useSaveCurrentFile, useTabContentUpdates, useSlashMenuControl,
  useEditorBodyUpdate, useTableDndAndMarkdownConversion, useExportPdf, useSyncWysiwygFromMarkdown,
  useRawEditorDrop, useRawEditorKeyDown, useContextMenuActions,
  useReadonlyDateFormatter, useEditorUIHelpers, useToggleTemplateStatus,
  useTocItems, useEditorImageLoader, useStartupNavigation, usePendingTitleFocus,
} from './hooks'
import { flatTreeFiles } from './lib/appUtils'

function App() {
  // ── State from contexts ──────────────────────────────────────────────────────
  const {
    activeTab,
    editorMode,
  } = useEditor()

  const {
    tree,
    fileMetaByPath,
    activeSidebar,
    contextMenu,
  } = useWorkspace()

  const {
    showSettings, setShowSettings,
  } = useUI()

  const {
    gitState,
  } = useConfig()
  const {
    confirmDialog,
    requestConfirmation,
    resolveConfirmationDialog,
  } = useConfirmationDialog()

  const {
    appVersion,
    updateAvailable,
    updateReady,
    updateProgress,
    dismissUpdate,
  } = useAppUpdates()

  const {
    isCompactLayout,
    isSidebarOpenOnCompact,
    setIsSidebarOpenOnCompact,
    selectSidebar,
  } = useCompactLayout()

  const templateOptions = useTemplateOptions(fileMetaByPath)

  const desktopApiAvailable = typeof window.holo !== 'undefined'

  const { focusActiveEditorSoon } = useFocusActiveEditor()

  const { ensureWritableMode } = useEnsureWritableMode()

  const { discardTransientEditorState } = useDiscardTransientEditorState()

  const tocItems = useTocItems()

  const { getHoloApi } = useGetHoloApi()

  const {
    showChangelogModal,
    selectedChangelogEntry,
    currentVersionChangelog,
    openChangelog,
    closeChangelog,
    markCurrentVersionChangelogAsSeen,
  } = useChangelogFlow({ appVersion, getHoloApi })

  const {
    refreshTree,
    applyOpenedFolder,
    refreshRecentFolders,
    refreshArchivedFiles,
    openFolder,
    openRecentFolder,
    removeRecentFolder,
  } = useWorkspaceFolders({ getHoloApi })

  const { refreshActiveTabFromDisk } = useRefreshActiveTabFromDisk()

  const {
    refreshGitState,
    applyRemoteEditBlockFromGitState,
    pullChanges,
    fetchChanges,
    syncRepository,
    resolveConflictChoice,
  } = useGitWorkflow({
    getHoloApi,
    refreshTree,
    refreshActiveTabFromDisk,
    requestConfirmation,
  })

  const {
    ensureImageProviderReady,
    saveRepoImageConfig,
    saveFolderIconConfig,
  } = useRepoImageSettings({ getHoloApi, ensureWritableMode, refreshGitState })

  useRecentFolderIcons({ getHoloApi })

  useGlobalConfig({ getHoloApi })

  useFileMetadata()

  const allFilePaths = useMemo(() => (tree ? flatTreeFiles(tree) : []), [tree])
  const { myFilePaths } = useMyFilePaths({ allFilePaths, getHoloApi })
  const { visibleRecentFilePaths, linkPageSuggestions } = useNavigationSuggestions({ allFilePaths })

  useCompactToc({
    isCompactLayout,
    tocItemsCount: tocItems.length,
  })

  useTemplateVariables({ getHoloApi })

  const { toggleDirectory } = useToggleDirectory()

  const { openFile } = useOpenFile({
    getHoloApi, applyRemoteEditBlockFromGitState, focusActiveEditorSoon,
  })

  const { openEditorLink } = useOpenEditorLink({ getHoloApi, openFile })

  useStartupNavigation({ openFile, openRecentFolder })

  const { onSelectNode, confirmDiscardAndSwitchFile, cancelDiscardAndSwitchFile } = useFileNavigation({
    discardTransientEditorState, openFile,
  })

  const { saveCurrentFile } = useSaveCurrentFile({
    ensureWritableMode, getHoloApi, refreshGitState, refreshTree,
  })

  const { updateActiveTabContent, updateEditableHeader, updateTags } = useTabContentUpdates()

  const { updateActiveTabBody } = useEditorBodyUpdate({ updateActiveTabContent })

  const { closeSlashMenu } = useSlashMenuControl()

  const {
    searchQuery,
    searchResults,
    isSearching,
    onSearchInput,
    clearSearch,
  } = useSearchWorkflow({
    getHoloApi,
    allFilePaths,
  })

  const { askAi } = useAiProviderClient()

  const {
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
  } = useWysiwygBlockHelpers()

  const {
    isImageFile,
    onEditorDragOver,
    onEditorDragEnter,
    onEditorDragLeave,
  } = useEditorImageDrag()


  const { executeSlashCommand } = useSlashCommandExecutor({
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
    turndownService,
    updateActiveTabBody,
    getHoloApi,
    closeSlashMenu,
  })

  const { onWysiwygKeyDown } = useWysiwygKeyDown({
    executeSlashCommand,
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
    turndownService,
    updateActiveTabBody,
  })

  const { getNextTableDndId, markdownToHtml } = useTableDndAndMarkdownConversion()

  const { handleImageFiles } = useImageUploadHandler({ getHoloApi, ensureImageProviderReady })

  const { exportActiveFileToPdf } = useExportPdf({ getHoloApi, markdownToHtml })

  const { syncWysiwygFromMarkdown } = useSyncWysiwygFromMarkdown({ markdownToHtml })

  const { formatCodeBlock } = useCodeBlockFormatter({
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
  })

  // Load images with data-src via IPC
  useEditorImageLoader({ desktopApiAvailable, getHoloApi })
  usePendingTitleFocus()

  const submitAiDialog = useAiDialogSubmission({
    askAi,
    markdownToHtml,
    turndownService,
    updateActiveTabBody,
  })

  const {
    insertLinkIntoEditor,
    clearLinkSavedRange,
  } = useEditorLinkInsertion({
    turndownService,
    updateActiveTabBody,
  })

  const {
    refreshTableSummaries,
    onWysiwygDragStart,
    onWysiwygDragOver,
    onWysiwygDrop,
    onWysiwygDragEnd,
    insertTableRow,
    insertTableColumn,
    deleteTableRow,
    deleteTableColumn,
    sortTableByCurrentColumn,
    setCurrentColumnType,
    openCurrentColumnTypePicker,
  } = useTableInteractions({
    getNextTableDndId,
    onEditorDragOver,
    handleImageFiles,
    isImageFile,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
  })

  const { onWysiwygInput } = useWysiwygInputHandler({
    getBlockTextBeforeCursor,
    turndownService,
    updateActiveTabBody,
    refreshTableSummaries,
  })

  const { onRawDrop } = useRawEditorDrop({
    isImageFile, handleImageFiles, updateActiveTabBody,
  })

  const { onRawKeyDown } = useRawEditorKeyDown({ updateActiveTabBody })



  const { closeContextMenu, openTreeContextMenu, runContextAction } = useContextMenuActions()

  useContextMenuDismiss({
    contextMenuOpen: contextMenu !== null,
    closeContextMenu,
  })

  const { moveNode, autoCommitStructuralChange } = useMoveNode({
    ensureWritableMode,
    getHoloApi,
    refreshTree,
    refreshGitState,
  })

  useEditorSelectionPopup()

  useEditorOverlayEffects()

  const { formatReadonlyDate } = useReadonlyDateFormatter()

  const { runWysiwygCommand, onTocItemClick } = useEditorUIHelpers({ onWysiwygInput })

  const {
    openCreateFileDialog,
    openCreateDirectoryDialog,
    openRenameDialog,
  } = useNameDialogActions({ ensureWritableMode })

  const { submitNameDialog } = useNameDialogSubmission({
    ensureWritableMode,
    getHoloApi,
    refreshTree,
    refreshGitState,
    autoCommitStructuralChange,
  })

  const { toggleTemplateStatus } = useToggleTemplateStatus({
    ensureWritableMode, getHoloApi, refreshTree, refreshGitState,
  })

  const {
    archivePathTarget,
    restoreArchivedPathTarget,
    deletePathTarget,
    copyPathTarget,
  } = usePathTargetActions({
    ensureWritableMode,
    getHoloApi,
    requestConfirmation,
    refreshTree,
    refreshArchivedFiles,
    refreshGitState,
    autoCommitStructuralChange,
  })


  const {
    openCommitDialog,
    openMergeDialog,
    submitGitDialog,
  } = useGitDialogActions({ getHoloApi, refreshGitState })

  const {
    openConflictedFile,
    copyHoloLink,
    openFileInNewWindow,
    closeOpenedFolder,
    submitAuthorProfile,
    logoutAuthorProfile,
  } = useWorkspaceUiActions({ getHoloApi, openFile })

  const {
    onPullNow,
    onOpenLinkFromSelection,
    onOpenAiTransformFromSelection,
    onCloseColumnTypePopup,
    onApplyCodeLanguage,
    onToggleCompactToc,
    onCompactTocItemClick,
    onEditorSwitchRaw,
    onEditorSwitchWysiwyg,
    onEditorExportPdf,
    onEditorSave,
  } = useEditorUiCallbacks({
    pullChanges,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
    onTocItemClick,
    exportActiveFileToPdf,
    saveCurrentFile,
  })

  const {
    openCloneDialog,
    pickCloneDirectory,
    submitCloneDialog,
  } = useCloneWorkflow({ getHoloApi, applyOpenedFolder, refreshRecentFolders })


  const sidebarSearchPanelProps = {
    isCompactLayout,
    searchQuery,
    searchResults,
    isSearching,
    onSearchInput,
    onClearSearch: clearSearch,
    onSelectNode,
    onOpenTreeContextMenu: openTreeContextMenu,
    onSetActiveSidebar: selectSidebar,
  }

  return (
    <main
      className={`h-screen bg-[#242527] text-white rounded-lg font-sans ${isCompactLayout ? 'grid grid-cols-1 grid-rows-[64px_1fr]' : 'gap-x-2 grid grid-cols-[auto_1fr] grid-rows-[64px_1fr]'} overflow-hidden select-none`}
      style={{ gridTemplateAreas: isCompactLayout ? `'appbar' 'content'` : `'appbar appbar' 'sidebar content'` }}
    >

      {/* App header */}
      <AppHeaderWrapper
        isCompactLayout={isCompactLayout}
        appVersion={appVersion}
        isSidebarOpenOnCompact={isSidebarOpenOnCompact}
        onToggleSidebar={() => setIsSidebarOpenOnCompact((previous) => !previous)}
        onLogout={logoutAuthorProfile}
      />

      {isCompactLayout && isSidebarOpenOnCompact && (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
          onClick={() => setIsSidebarOpenOnCompact(false)}
        />
      )}

      <AppSidebar
        isCompactLayout={isCompactLayout}
        isSidebarOpenOnCompact={isSidebarOpenOnCompact}
        activeSidebar={activeSidebar}
        showSettings={showSettings}
        hasActiveTab={Boolean(activeTab)}
        gitIncoming={gitState.incoming}
        gitOutgoing={gitState.outgoing}
        onSelectSidebar={selectSidebar}
        onToggleSearch={() => selectSidebar(activeSidebar === 'search' ? 'files' : 'search')}
        onToggleSettings={() => setShowSettings((v) => !v)}
      >

        {/* Panel Fichiers */}
        {activeSidebar === 'files' && (
          <SidebarFilesPanelWrapper
            isCompactLayout={isCompactLayout}
            myFilePaths={myFilePaths}
            visibleRecentFilePaths={visibleRecentFilePaths}
            desktopApiAvailable={desktopApiAvailable}
            onCloseFolder={closeOpenedFolder}
            onOpenFolder={openFolder}
            onOpenCloneDialog={openCloneDialog}
            onOpenRecentFolder={openRecentFolder}
            onRemoveRecentFolder={removeRecentFolder}
            onSelectNode={onSelectNode}
            onContextMenu={openTreeContextMenu}
            onToggleDirectory={toggleDirectory}
            moveNode={moveNode}
            onOpenFile={openFile}
          />
        )}
        {/* Panel Recherche */}
        {activeSidebar === 'search' && (
          <SidebarSearchPanel {...sidebarSearchPanelProps} />
        )}
        {/* Panel Git */}
        {activeSidebar === 'git' && (
          <SidebarGitPanelWrapper
            isCompactLayout={isCompactLayout}
            onSyncRepository={syncRepository}
            onOpenCommitDialog={openCommitDialog}
            onPullChanges={pullChanges}
            onOpenMergeDialog={openMergeDialog}
            onFetchChanges={fetchChanges}
            onRefreshGitState={refreshGitState}
            onResolveConflictChoice={resolveConflictChoice}
            onOpenConflictedFile={openConflictedFile}
          />
        )}
      </AppSidebar>

      {/* Zone d'édition principale */}
      <section className="flex min-w-0 min-h-0 flex-col bg-[#292929]" style={{ gridArea: 'content' }}>
          {/* Éditeur */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col">
            {activeTab ? (
              <>
                <EditorTopBarWrapper
                  isCompactLayout={isCompactLayout}
                  tocItems={tocItems}
                  onToggleCompactToc={onToggleCompactToc}
                  onCompactTocItemClick={onCompactTocItemClick}
                  onSwitchRaw={onEditorSwitchRaw}
                  onSwitchWysiwyg={onEditorSwitchWysiwyg}
                  onExportPdf={onEditorExportPdf}
                  onCopyLink={() => { void copyHoloLink(activeTab.path) }}
                  onSave={onEditorSave}
                />

                <EditorCanvasWrapper
                  isCompactLayout={isCompactLayout}
                  formatReadonlyDate={formatReadonlyDate}
                  updateEditableHeader={updateEditableHeader}
                  updateTags={updateTags}
                  onRawChange={updateActiveTabBody}
                  onRawKeyDown={onRawKeyDown}
                  onRawDrop={onRawDrop}
                  onEditorDragEnter={onEditorDragEnter}
                  onEditorDragOver={onEditorDragOver}
                  onEditorDragLeave={onEditorDragLeave}
                  onWysiwygInput={onWysiwygInput}
                  onWysiwygKeyDown={onWysiwygKeyDown}
                  onWysiwygDrop={onWysiwygDrop}
                  onWysiwygDragStart={onWysiwygDragStart}
                  onWysiwygDragEnd={onWysiwygDragEnd}
                  onWysiwygDragOver={onWysiwygDragOver}
                  openEditorLink={openEditorLink}
                  updateActiveTabBody={updateActiveTabBody}
                  syncWysiwygFromMarkdown={syncWysiwygFromMarkdown}
                  markdownToHtml={markdownToHtml}
                  refreshTableSummaries={refreshTableSummaries}
                  onPullNow={onPullNow}
                />
                
                <EditorOverlaysWrapper
                  runWysiwygCommand={runWysiwygCommand}
                  onOpenLinkFromSelection={onOpenLinkFromSelection}
                  onOpenAiTransformFromSelection={onOpenAiTransformFromSelection}
                  insertTableRow={insertTableRow}
                  insertTableColumn={insertTableColumn}
                  sortTableByCurrentColumn={sortTableByCurrentColumn}
                  openCurrentColumnTypePicker={openCurrentColumnTypePicker}
                  deleteTableRow={deleteTableRow}
                  deleteTableColumn={deleteTableColumn}
                  setCurrentColumnType={setCurrentColumnType}
                  onCloseColumnTypePopup={onCloseColumnTypePopup}
                  formatCodeBlock={formatCodeBlock}
                  onApplyCodeLanguage={onApplyCodeLanguage}
                  executeSlashCommand={executeSlashCommand}
                />

              </>
            ) : <EditorEmptyState />}
            </div>{/* end flex-1 min-w-0 content area */}

            {/* Table des matières — colonne droite séparée */}
            <EditorRightToc
              editorMode={editorMode}
              tocItems={tocItems}
              onTocItemClick={onTocItemClick}
            />
          </div>{/* end flex-1 min-h-0 flex row */}
      </section>

      <AiDialogModalWrapper onSubmitAiDialog={() => { void submitAiDialog() }} />

      <ContextMenuWrapper
        onRunContextAction={runContextAction}
        onOpenCreateFileDialog={openCreateFileDialog}
        onOpenCreateDirectoryDialog={openCreateDirectoryDialog}
        onOpenRenameDialog={openRenameDialog}
        onToggleTemplateStatus={toggleTemplateStatus}
        onCopyHoloLink={copyHoloLink}
        onCopyPathTarget={copyPathTarget}
        onOpenFileInNewWindow={openFileInNewWindow}
        onArchivePathTarget={archivePathTarget}
        onRestoreArchivedPathTarget={restoreArchivedPathTarget}
        onDeletePathTarget={deletePathTarget}
      />

      <FolderIconPickerWrapper onSaveFolderIconConfig={saveFolderIconConfig} />


      <AppSettingsModal
        appVersion={appVersion}
        currentVersionChangelog={currentVersionChangelog}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        saveRepoImageConfig={saveRepoImageConfig}
        submitAuthorProfile={submitAuthorProfile}
        openChangelog={openChangelog}
      />
      <AppModalsWrapper
        showChangelogModal={showChangelogModal}
        selectedChangelogEntry={selectedChangelogEntry}
        appVersion={appVersion}
        closeChangelog={closeChangelog}
        markCurrentVersionChangelogAsSeen={markCurrentVersionChangelogAsSeen}
        cancelDiscardAndSwitchFile={cancelDiscardAndSwitchFile}
        confirmDiscardAndSwitchFile={confirmDiscardAndSwitchFile}
        confirmDialog={confirmDialog}
        resolveConfirmationDialog={resolveConfirmationDialog}
        linkPageSuggestions={linkPageSuggestions}
        clearLinkSavedRange={clearLinkSavedRange}
        insertLinkIntoEditor={insertLinkIntoEditor}
        fetchChanges={fetchChanges}
        templateOptions={templateOptions}
        submitNameDialog={submitNameDialog}
        submitCloneDialog={submitCloneDialog}
        pickCloneDirectory={pickCloneDirectory}
        submitGitDialog={submitGitDialog}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        updateProgress={updateProgress}
        dismissUpdate={dismissUpdate}
      />
    </main>
  )
}

export default App
