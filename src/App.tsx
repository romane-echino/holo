import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmojiPicker from 'emoji-picker-react'
import { Theme } from 'emoji-picker-react'
import {
  turndownService,
  parseMarkdownToHtml,
  splitMarkdownFrontMatter,
  getEditableMarkdownHeader,
  updateMarkdownHeaderField,
  updateTagsInMarkdown,
  updateMarkdownBooleanHeaderField,
  updateMarkdownBody,
} from './lib/markdown'
import { useTableInteractions } from './components/table/useTableInteractions'
import { AppHeader } from './components/AppHeader'
import { AiDialogModal } from './components/AiDialogModal'
import { AppModals } from './components/AppModals'
import { AppSidebar } from './components/AppSidebar'
import { EditorCanvas } from './components/EditorCanvas'
import { EditorEmptyState } from './components/EditorEmptyState'
import { EditorOverlays } from './components/EditorOverlays'
import { EditorRightToc } from './components/EditorRightToc'
import { EditorTopBar } from './components/EditorTopBar'
import { SettingsModal } from './components/SettingsModal'
import { ExplorerTreeItem } from './components/ExplorerTreeItem'
import { useAppUpdates } from './hooks/useAppUpdates'
import { useDesktopWindow } from './hooks/useDesktopWindow'
import { DEFAULT_SYNC_FEEDBACK, type SyncFeedback, useGitWorkflow } from './hooks/useGitWorkflow'
import { useRepoImageSettings, type ImageStorageMode } from './hooks/useRepoImageSettings'
import { useGlobalConfig } from './hooks/useGlobalConfig'
import { useFileMetadata } from './hooks/useFileMetadata'
import { useMyFilePaths } from './hooks/useMyFilePaths'
import { useNavigationSuggestions } from './hooks/useNavigationSuggestions'
import { useTemplateVariables } from './hooks/useTemplateVariables'
import { useCompactToc } from './hooks/useCompactToc'
import { useCompactLayout } from './hooks/useCompactLayout'
import { useChangelogFlow } from './hooks/useChangelogFlow'
import { useEditorOverlayState } from './hooks/useEditorOverlayState'
import { useConfirmationDialog } from './hooks/useConfirmationDialog'
import { useTemplateOptions } from './hooks/useTemplateOptions'
import { useAiDialogSubmission } from './hooks/useAiDialogSubmission'
import { useNameDialogActions } from './hooks/useNameDialogActions'
import { usePathTargetActions } from './hooks/usePathTargetActions'
import { useWindowHeaderDrag } from './hooks/useWindowHeaderDrag'
import { useCloneWorkflow } from './hooks/useCloneWorkflow'
import { useGitDialogActions } from './hooks/useGitDialogActions'
import { useWorkspaceUiActions } from './hooks/useWorkspaceUiActions'
import { useEditorUiCallbacks } from './hooks/useEditorUiCallbacks'
import { useWorkspaceFolders } from './hooks/useWorkspaceFolders'
import { useSearchWorkflow } from './hooks/useSearchWorkflow'
import { useAiProviderClient } from './hooks/useAiProviderClient'
import { useRecentFolderIcons } from './hooks/useRecentFolderIcons'
import { useWysiwygBlockHelpers } from './hooks/useWysiwygBlockHelpers'
import { useEditorImageDrag } from './hooks/useEditorImageDrag'
import { useSlashCommandExecutor } from './hooks/useSlashCommandExecutor'
import { useSlashMenuKeyboard } from './hooks/useSlashMenuKeyboard'
import { useImageUploadHandler } from './hooks/useImageUploadHandler'
import { useCodeBlockFormatter } from './hooks/useCodeBlockFormatter'
import { useEditorLinkInsertion } from './hooks/useEditorLinkInsertion'
import { useWysiwygStructuralKeys } from './hooks/useWysiwygStructuralKeys'
import { useWysiwygTabNavigation } from './hooks/useWysiwygTabNavigation'
import { useWysiwygKeyGuards } from './hooks/useWysiwygKeyGuards'
import { useWysiwygInputHandler } from './hooks/useWysiwygInputHandler'
import { useEditorSelectionPopup } from './hooks/useEditorSelectionPopup'
import { useEditorOverlayEffects } from './hooks/useEditorOverlayEffects'
import { useContextMenuDismiss } from './hooks/useContextMenuDismiss'
import { useMoveNode } from './hooks/useMoveNode'
import { useNameDialogSubmission } from './hooks/useNameDialogSubmission'
import { DEFAULT_GIT_STATE, isLikelyGitAuthError, normalizeGitState } from './lib/gitUtils'
import type { EditableMarkdownHeader, FilePathStats, WysiwygCommand } from './types/editor'
import type { FileMeta, NodeType, TreeNode } from './types/app'
import type { GitState, RemoteEditBlock } from './types/git'
import type {
  NameDialog,
  GitDialog,
  CloneDialog,
  ChangelogEntry,
} from './types/shared'
import {
  applyMarkdownListTabBehavior,
  getParentPath,
  getBaseName,
  isSameOrChildPath,
  buildAutoCommitMessage,
  resolveRepoRelativePath,
  getRelativeLinkPath,
  flatTreeFiles,
} from './lib/appUtils'
import { CHANGELOG_ENTRIES } from './constants/changelog'
import { matchesSlashQuery, SLASH_COMMANDS } from './lib/editorSlash'

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type ContextMenuState = {
  x: number
  y: number
  node: TreeNode
}

type ArchivedFileEntry = {
  archivedPath: string
  originalPath: string
  name: string
}


type TocItem = {
  level: number
  text: string
  headingIndex: number
}



function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [activeTab, setActiveTab] = useState<OpenTab | null>(null)
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [pathStatsByPath, setPathStatsByPath] = useState<Record<string, FilePathStats>>({})
  const [recentFolders, setRecentFolders] = useState<string[]>([])
  const [recentFolderIconByPath, setRecentFolderIconByPath] = useState<Record<string, string>>({})
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [gitState, setGitState] = useState<GitState>(DEFAULT_GIT_STATE)
  const [gitDialog, setGitDialog] = useState<GitDialog | null>(null)
  const [cloneDialog, setCloneDialog] = useState<CloneDialog | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ text: string; url: string; pageQuery?: string } | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [isGitBusy, setIsGitBusy] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>(DEFAULT_SYNC_FEEDBACK)
  const [showGitAuthHelp, setShowGitAuthHelp] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'synced' | 'local'>('idle')
  const [copyLinkStatus, setCopyLinkStatus] = useState<'idle' | 'copied'>('idle')
  const [remoteEditBlock, setRemoteEditBlock] = useState<RemoteEditBlock>({
    isBlocked: false,
    message: '',
  })
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git' | 'search'>('files')
  const [seenChangelogVersion, setSeenChangelogVersion] = useState('')
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [pendingFileSwitchPath, setPendingFileSwitchPath] = useState<string | null>(null)
  const [globalConfigReady, setGlobalConfigReady] = useState(false)
  const [shareGatewayBaseUrl, setShareGatewayBaseUrl] = useState('https://holo-link-gateway-git-main-romanedonnet-8817s-projects.vercel.app')
  const [filesSection, setFilesSection] = useState<'explorer' | 'mine' | 'recent'>('explorer')
  const [appAuthor, setAppAuthor] = useState('')
  const [showAuthorModal, setShowAuthorModal] = useState(false)
  const [authorModalMode, setAuthorModalMode] = useState<'startup' | 'edit'>('startup')
  const [authorModalValue, setAuthorModalValue] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [readOnlyMode, setReadOnlyMode] = useState(false)
  const [gitEmail, setGitEmail] = useState('')
  const [repoImageModeReady, setRepoImageModeReady] = useState(false)
  const [repoImageStorageMode, setRepoImageStorageMode] = useState<ImageStorageMode>('local')
  const [azureBlobContainerUrl, setAzureBlobContainerUrl] = useState('')
  const [azureBlobSasToken, setAzureBlobSasToken] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3AccessKeyId, setS3AccessKeyId] = useState('')
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3PublicBaseUrl, setS3PublicBaseUrl] = useState('')
  const [dropboxAccessToken, setDropboxAccessToken] = useState('')
  const [dropboxFolderPath, setDropboxFolderPath] = useState('/holo-images')
  const [gdriveAccessToken, setGdriveAccessToken] = useState('')
  const [gdriveFolderId, setGdriveFolderId] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'auto' | 'openai' | 'gemini'>('auto')
  const [openaiPrompt, setOpenaiPrompt] = useState('Tu es un assistant qui aide à rédiger de la documentation technique en Markdown. Réponds toujours en Markdown bien structuré, avec des titres, listes et code blocks si nécessaire.')
  const [showSettings, setShowSettings] = useState(false)
  const [archivedFiles, setArchivedFiles] = useState<ArchivedFileEntry[]>([])
  const [recentFilePaths, setRecentFilePaths] = useState<string[]>([])
  const [fileIconByPath, setFileIconByPath] = useState<Record<string, string>>({})
  const [fileMetaByPath, setFileMetaByPath] = useState<Record<string, FileMeta>>({})
  const [folderIconByPath, setFolderIconByPath] = useState<Record<string, string>>({})
  const [showFolderIconPicker, setShowFolderIconPicker] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'raw' | 'wysiwyg'>('wysiwyg')
  const [isImageDragOverEditor, setIsImageDragOverEditor] = useState(false)
  const {
    imageDragDepthRef,
    tableDndCounterRef,
    titleInputRef,
    showEmojiPicker,
    setShowEmojiPicker,
    wysiwygEditorRef,
    rawEditorRef,
    codeBlockLeaveTimerRef,
    isSyncingWysiwygRef,
    lastWysiwygSyncedTabRef,
    hoveredCodeBlock,
    setHoveredCodeBlock,
    pendingTitleFocusPath,
    setPendingTitleFocusPath,
    selectionPopup,
    setSelectionPopup,
    tablePopup,
    setTablePopup,
    codeBlockPopup,
    setCodeBlockPopup,
    showCompactToc,
    setShowCompactToc,
    slashMenu,
    setSlashMenu,
    slashMenuIndex,
    setSlashMenuIndex,
    slashMenuListRef,
    compactTocRef,
    aiDialog,
    setAiDialog,
    aiSavedRangeRef,
    linkSavedRangeRef,
    aiTextareaRef,
    columnTypePopup,
    setColumnTypePopup,
  } = useEditorOverlayState()
  const {
    confirmDialog,
    requestConfirmation,
    resolveConfirmationDialog,
  } = useConfirmationDialog()
  const startupNavigationDoneRef = useRef(false)
  const headerRef = useRef<HTMLElement | null>(null)

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
  } = useCompactLayout({
    activeTabPath,
    setActiveSidebar,
  })

  const templateOptions = useTemplateOptions(fileMetaByPath)

  useEffect(() => {
    if (!slashMenu) return
    const listEl = slashMenuListRef.current
    if (!listEl) return
    const activeItem = listEl.querySelector<HTMLButtonElement>(`[data-slash-index="${slashMenuIndex}"]`)
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [slashMenu, slashMenuIndex])

  const showTypeRBadge = appAuthor.trim().toLowerCase() === 'virgile'
  const desktopApiAvailable = typeof window.holo !== 'undefined'
  const isEditorReadOnly = readOnlyMode || remoteEditBlock.isBlocked
  const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode
  const hasAiProviderConfigured = openaiApiKey.trim().length > 0 || geminiApiKey.trim().length > 0

  const focusActiveEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      if (effectiveEditorMode === 'raw') {
        rawEditorRef.current?.focus()
        return
      }

      if (!isEditorReadOnly) {
        wysiwygEditorRef.current?.focus()
      }
    }, 0)
  }, [effectiveEditorMode, isEditorReadOnly])

  const ensureWritableMode = useCallback(() => {
    if (!readOnlyMode) {
      return true
    }

    window.alert('Le mode lecture seule est activé. Désactive-le pour modifier ce contenu.')
    return false
  }, [readOnlyMode])

  const discardTransientEditorState = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    wysiwygEditorRef.current?.blur()
    rawEditorRef.current?.blur()
    setActiveTab((prev) => (prev ? { ...prev, isDirty: false } : prev))
    setActiveTab(null)
    setActiveTabPath(null)
    lastWysiwygSyncedTabRef.current = null
    isSyncingWysiwygRef.current = false
    aiSavedRangeRef.current = null
    linkSavedRangeRef.current = null
    setSelectionPopup(null)
    setTablePopup(null)
    setCodeBlockPopup(null)
    setColumnTypePopup(null)
    setHoveredCodeBlock(null)
    setShowCompactToc(false)
    setSlashMenu(null)
  }, [])

  useEffect(() => {
    if (readOnlyMode) {
      setEditorMode('wysiwyg')
    }
  }, [readOnlyMode])

  const editableHeader = useMemo(
    () => getEditableMarkdownHeader(activeTab?.content ?? ''),
    [activeTab?.content],
  )

  const activeTabBody = useMemo(
    () => splitMarkdownFrontMatter(activeTab?.content ?? '').body,
    [activeTab?.content],
  )

  const tocItems = useMemo<TocItem[]>(() => {
    const lines = activeTabBody.split('\n')
    const items: TocItem[] = []
    let inCodeFence = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (/^(```|~~~)/.test(trimmed)) {
        inCodeFence = !inCodeFence
        continue
      }

      if (inCodeFence) {
        continue
      }

      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) {
        continue
      }

      const level = match[1].length
      const text = match[2]
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim()

      if (!text) {
        continue
      }

      items.push({
        level,
        text,
        headingIndex: items.length,
      })
    }

    return items
  }, [activeTabBody])

  const activePathStats = useMemo(
    () => (activeTabPath ? pathStatsByPath[activeTabPath] ?? null : null),
    [activeTabPath, pathStatsByPath],
  )

  const getHoloApi = useCallback(() => {
    if (!window.holo) {
      window.alert(
        "L'API Electron n'est pas disponible. Lance l'application avec `npm run dev` (Electron), pas uniquement Vite dans le navigateur.",
      )
      return null
    }

    return window.holo
  }, [])

  const {
    showChangelogModal,
    selectedChangelogEntry,
    currentVersionChangelog,
    openChangelog,
    closeChangelog,
    markCurrentVersionChangelogAsSeen,
  } = useChangelogFlow({
    changelogEntries: CHANGELOG_ENTRIES,
    appVersion,
    globalConfigReady,
    seenChangelogVersion,
    setSeenChangelogVersion,
    getHoloApi,
  })

  const {
    windowIsMaximized,
    windowPlatform,
    setWindowIsMaximized,
    setWindowPlatform,
    minimizeWindow,
    toggleDevTools,
    toggleMaximizeWindow,
    closeWindow,
  } = useDesktopWindow(getHoloApi)

  const { onHeaderMouseDown } = useWindowHeaderDrag({
    headerRef,
    windowIsMaximized,
    windowPlatform,
    setWindowIsMaximized,
    setWindowPlatform,
  })

  const {
    refreshTree,
    applyOpenedFolder,
    refreshRecentFolders,
    refreshArchivedFiles,
    openFolder,
    openRecentFolder,
    removeRecentFolder,
  } = useWorkspaceFolders({
    getHoloApi,
    setRootPath,
    setTree,
    setSelectedPath,
    setSelectedType,
    setExpandedDirectories,
    setArchivedFiles,
    setFolderIconByPath,
    setActiveTab,
    setActiveTabPath,
    setGitState,
    setRecentFolders,
  })

  const refreshActiveTabFromDisk = useCallback(
    async (holo: NonNullable<Window['holo']>) => {
      if (!activeTabPath) {
        return
      }

      const refreshedContent = await holo.readFile(activeTabPath).catch(() => null)

      if (typeof refreshedContent === 'string') {
        setActiveTab((prev) =>
          prev && prev.path === activeTabPath
            ? { ...prev, content: refreshedContent, isDirty: false }
            : prev,
        )
      }
    },
    [activeTabPath],
  )

  const {
    refreshGitState,
    applyRemoteEditBlockFromGitState,
    pullChanges,
    fetchChanges,
    syncRepository,
    resolveConflictChoice,
  } = useGitWorkflow({
    rootPath,
    gitState,
    isGitBusy,
    activeTabPath,
    activeTabIsDirty: activeTab?.isDirty ?? false,
    getHoloApi,
    refreshTree,
    refreshActiveTabFromDisk,
    requestConfirmation,
    setGitState,
    setRemoteEditBlock,
    setSyncFeedback,
    setIsGitBusy,
  })

  const {
    ensureImageProviderReady,
    saveRepoImageConfig,
    saveFolderIconConfig,
  } = useRepoImageSettings({
    rootPath,
    globalConfigReady,
    appAuthor,
    gitState,
    repoImageStorageMode,
    azureBlobContainerUrl,
    azureBlobSasToken,
    s3Region,
    s3Bucket,
    s3AccessKeyId,
    s3SecretAccessKey,
    dropboxAccessToken,
    gdriveAccessToken,
    getHoloApi,
    ensureWritableMode,
    refreshGitState,
    setShowSettings,
    setRepoImageStorageMode,
    setRepoImageModeReady,
    setFolderIconByPath,
  })

  useEffect(() => {
    void refreshRecentFolders()
  }, [refreshRecentFolders])

  useRecentFolderIcons({
    recentFolders,
    getHoloApi,
    setRecentFolderIconByPath,
  })

  useGlobalConfig({
    getHoloApi,
    initialOpenaiPrompt: openaiPrompt,
    initialShareGatewayBaseUrl: shareGatewayBaseUrl,
    values: {
      globalConfigReady,
      appAuthor,
      readOnlyMode,
      seenChangelogVersion,
      gitEmail,
      azureBlobContainerUrl,
      azureBlobSasToken,
      s3Region,
      s3Bucket,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      s3PublicBaseUrl,
      dropboxAccessToken,
      dropboxFolderPath,
      gdriveAccessToken,
      gdriveFolderId,
      openaiApiKey,
      geminiApiKey,
      aiProvider,
      openaiPrompt,
      shareGatewayBaseUrl,
    },
    setAppAuthor,
    setReadOnlyMode,
    setSeenChangelogVersion,
    setGitEmail,
    setAzureBlobContainerUrl,
    setAzureBlobSasToken,
    setS3Region,
    setS3Bucket,
    setS3AccessKeyId,
    setS3SecretAccessKey,
    setS3Endpoint,
    setS3PublicBaseUrl,
    setDropboxAccessToken,
    setDropboxFolderPath,
    setGdriveAccessToken,
    setGdriveFolderId,
    setOpenaiApiKey,
    setGeminiApiKey,
    setAiProvider,
    setOpenaiPrompt,
    setShareGatewayBaseUrl,
    setAuthorModalMode,
    setAuthorModalValue,
    setShowAuthorModal,
    setGlobalConfigReady,
  })

  useFileMetadata({
    tree,
    activeTabPath,
    activeTabContent: activeTab?.content,
    setFileIconByPath,
    setFileMetaByPath,
  })

  const allFilePaths = useMemo(() => (tree ? flatTreeFiles(tree) : []), [tree])
  const { myFilePaths } = useMyFilePaths({ allFilePaths, appAuthor, getHoloApi })
  const { visibleRecentFilePaths, linkPageSuggestions } = useNavigationSuggestions({
    allFilePaths,
    recentFilePaths,
    activeTabPath,
    pageQuery: linkDialog?.pageQuery ?? '',
  })

  useEffect(() => {
    if (!activeTabPath) {
      setRemoteEditBlock({ isBlocked: false, message: '' })
    }
  }, [activeTabPath])

  useCompactToc({
    showCompactToc,
    setShowCompactToc,
    compactTocRef,
    isCompactLayout,
    tocItemsCount: tocItems.length,
  })

  useTemplateVariables({
    nameDialog,
    appAuthor,
    getHoloApi,
    setNameDialog,
  })

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(directoryPath)) {
        next.delete(directoryPath)
      } else {
        next.add(directoryPath)
      }

      return next
    })
  }, [])

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
    [applyRemoteEditBlockFromGitState, focusActiveEditorSoon, getHoloApi, gitState],
  )

  const openEditorLink = useCallback(
    async (href: string) => {
      const trimmedHref = href.trim()
      if (!trimmedHref) {
        return
      }

      const holo = getHoloApi()

      if (/^(https?:|mailto:|holo:)/i.test(trimmedHref)) {
        if (holo) {
          await holo.openExternalUrl(trimmedHref)
        }
        return
      }

      const cleanHref = trimmedHref.split('#')[0]?.split('?')[0]?.trim() ?? ''
      if (!cleanHref) {
        return
      }

      let targetPath: string | null = null

      if (cleanHref.startsWith('/')) {
        if (rootPath) {
          targetPath = resolveRepoRelativePath(rootPath, cleanHref.replace(/^\/+/, ''))
        }
      } else if (activeTabPath) {
        const normalizedBaseDir = getParentPath(activeTabPath).replace(/\\/g, '/')
        const baseParts = normalizedBaseDir.split('/').filter(Boolean)
        const hrefParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean)
        const resolvedParts = [...baseParts]

        for (const part of hrefParts) {
          if (part === '.') {
            continue
          }

          if (part === '..') {
            if (resolvedParts.length > 0) {
              resolvedParts.pop()
            }
            continue
          }

          resolvedParts.push(part)
        }

        targetPath = `${activeTabPath.replace(/\\/g, '/').startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`
      }

      if (targetPath?.toLowerCase().endsWith('.md')) {
        await openFile(targetPath)
        return
      }

      if (holo) {
        await holo.openExternalUrl(trimmedHref)
      }
    },
    [activeTabPath, getHoloApi, openFile, rootPath],
  )

  useEffect(() => {
    if (startupNavigationDoneRef.current) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const rootPathParam = params.get('rootPath')?.trim()
    const filePathParam = params.get('filePath')?.trim()
    const startupErrorParam = params.get('startupError')?.trim()

    startupNavigationDoneRef.current = true

    if (startupErrorParam) {
      window.alert(startupErrorParam)
    }

    if (!rootPathParam) {
      return
    }

    void (async () => {
      try {
        await openRecentFolder(rootPathParam)
        if (filePathParam) {
          await openFile(filePathParam)
        }
      } catch (error) {
        console.error('Failed startup navigation:', error)
      }
    })()
  }, [openFile, openRecentFolder])

  const onSelectNode = useCallback(
    async (node: TreeNode) => {
      setSelectedPath(node.path)
      setSelectedType(node.type)

      if (node.type === 'file') {
        const isDirty = activeTab?.isDirty ?? false
        if (isDirty && activeTabPath && activeTabPath !== node.path) {
          setPendingFileSwitchPath(node.path)
          setShowUnsavedChangesModal(true)
          return
        }

        await openFile(node.path)
      }
    },
    [activeTab, activeTabPath, openFile],
  )

  const confirmDiscardAndSwitchFile = useCallback(async () => {
    if (!pendingFileSwitchPath) {
      setShowUnsavedChangesModal(false)
      return
    }

    setShowUnsavedChangesModal(false)
    discardTransientEditorState()
    const nextPath = pendingFileSwitchPath
    setPendingFileSwitchPath(null)
    await openFile(nextPath)
  }, [discardTransientEditorState, openFile, pendingFileSwitchPath])

  const cancelDiscardAndSwitchFile = useCallback(() => {
    setShowUnsavedChangesModal(false)
    setPendingFileSwitchPath(null)
  }, [])

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
  }, [activeTab, appAuthor, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, gitState.isRepo, rootPath])

  const updateActiveTabContent = useCallback(
    (nextContent: string) => {
      if (isEditorReadOnly) {
        return
      }

      setActiveTab((prev) => (prev ? { ...prev, content: nextContent, isDirty: true } : prev))
    },
    [isEditorReadOnly],
  )

  const updateEditableHeader = useCallback(
    (field: keyof EditableMarkdownHeader, value: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownHeaderField(activeTab.content, field, value)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!activeTab) return
      const nextMarkdown = updateTagsInMarkdown(activeTab.content, tags)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const {
    searchQuery,
    searchResults,
    isSearching,
    onSearchInput,
    clearSearch,
  } = useSearchWorkflow({
    getHoloApi,
    allFilePaths,
    archivedFiles,
    rootPath,
  })

  const { askAi } = useAiProviderClient({
    aiProvider,
    openaiApiKey,
    geminiApiKey,
    openaiPrompt,
  })

  const {
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
  } = useWysiwygBlockHelpers({ wysiwygEditorRef })

  const {
    isImageFile,
    onEditorDragOver,
    onEditorDragEnter,
    onEditorDragLeave,
  } = useEditorImageDrag({
    isEditorReadOnly,
    imageDragDepthRef,
    setIsImageDragOverEditor,
  })

  const closeSlashMenu = useCallback(() => {
    setSlashMenu(null)
    setSlashMenuIndex(0)
  }, [setSlashMenu, setSlashMenuIndex])

  const updateActiveTabBody = useCallback(
    (nextBody: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownBody(activeTab.content, nextBody)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const { executeSlashCommand } = useSlashCommandExecutor({
    wysiwygEditorRef,
    linkSavedRangeRef,
    aiSavedRangeRef,
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
    turndownService,
    updateActiveTabBody,
    getHoloApi,
    closeSlashMenu,
    setLinkDialog,
    setAiDialog,
    setShowSettings,
    imageConfig: {
      mode: repoImageStorageMode,
      azureBlobContainerUrl,
      azureBlobSasToken,
      s3Region,
      s3Bucket,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      s3PublicBaseUrl,
      dropboxAccessToken,
      dropboxFolderPath,
      gdriveAccessToken,
      gdriveFolderId,
    },
  })

  const { handleSlashMenuKeyboard } = useSlashMenuKeyboard({
    slashMenu,
    slashMenuIndex,
    setSlashMenu,
    setSlashMenuIndex,
    executeSlashCommand,
    getBlockTextBeforeCursor,
  })

  const { handleWysiwygStructuralKeys } = useWysiwygStructuralKeys({
    deleteCurrentBlockContents,
    getBlockTextBeforeCursor,
    turndownService,
    updateActiveTabBody,
  })

  const { handleWysiwygTabNavigation } = useWysiwygTabNavigation({
    turndownService,
    updateActiveTabBody,
  })

  const { handleWysiwygKeyGuards } = useWysiwygKeyGuards({
    isEditorReadOnly,
  })

  const getNextTableDndId = useCallback(() => {
    const next = tableDndCounterRef.current
    tableDndCounterRef.current += 1
    return `table-dnd-${next}`
  }, [])

  const markdownToHtml = useCallback(
    (markdown: string) => parseMarkdownToHtml(markdown, getNextTableDndId),
    [getNextTableDndId],
  )

  const { handleImageFiles } = useImageUploadHandler({
    getHoloApi,
    ensureImageProviderReady,
    imageConfig: {
      mode: repoImageStorageMode,
      azureBlobContainerUrl,
      azureBlobSasToken,
      s3Region,
      s3Bucket,
      s3AccessKeyId,
      s3SecretAccessKey,
      s3Endpoint,
      s3PublicBaseUrl,
      dropboxAccessToken,
      dropboxFolderPath,
      gdriveAccessToken,
      gdriveFolderId,
    },
  })

  const exportActiveFileToPdf = useCallback(async () => {
    if (!activeTab) {
      window.alert('Aucun fichier actif à exporter.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const header = getEditableMarkdownHeader(activeTab.content)
      const title = (header.title.trim() || activeTab.name.replace(/\.md$/i, '') || 'Document').trim()
      const bodyHtml = markdownToHtml(splitMarkdownFrontMatter(activeTab.content).body)

      const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #1a1a1a; line-height: 1.55; }
    h1, h2, h3, h4 { margin: 1.2em 0 0.5em; line-height: 1.25; }
    p, ul, ol, blockquote, pre, table { margin: 0.55em 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #f4f4f5; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
    blockquote { border-left: 3px solid #8b5cf6; padding-left: 12px; color: #444; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d4d4d8; padding: 8px; text-align: left; vertical-align: top; }
    img { max-width: 100%; height: auto; }
    a { color: #5b46d9; text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`

      const result = await holo.exportPdf({
        html,
        suggestedName: `${title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'}.pdf`,
      })

      if (!result.ok) {
        if (!result.canceled) {
          window.alert(result.error || 'Export PDF annulé.')
        }
        return
      }

      window.alert(`PDF exporté :\n${result.filePath}`)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTab, getHoloApi, markdownToHtml])

  const syncWysiwygFromMarkdown = useCallback(
    (markdown: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      isSyncingWysiwygRef.current = true
      editor.innerHTML = markdownToHtml(markdown)
      isSyncingWysiwygRef.current = false
    },
    [markdownToHtml],
  )

  const { formatCodeBlock } = useCodeBlockFormatter({
    wysiwygEditorRef,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
  })

  useEffect(() => {
    if (editorMode !== 'wysiwyg' || !activeTabPath || !activeTab) {
      lastWysiwygSyncedTabRef.current = null
      return
    }

    if (lastWysiwygSyncedTabRef.current !== activeTabPath) {
      syncWysiwygFromMarkdown(splitMarkdownFrontMatter(activeTab.content).body)
      lastWysiwygSyncedTabRef.current = activeTabPath
    }
  }, [activeTab, activeTabPath, editorMode, syncWysiwygFromMarkdown])

  useEffect(() => {
    if (!pendingTitleFocusPath || activeTabPath !== pendingTitleFocusPath) {
      return
    }

    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
      setPendingTitleFocusPath(null)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeTabPath, pendingTitleFocusPath])

  // Load images with data-src via IPC
  useEffect(() => {
    if (!desktopApiAvailable) return

    const loadImagesInEditor = async () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const images = editor.querySelectorAll('img[data-src]')
      for (const img of images) {
        if (img.getAttribute('data-loaded') === 'true') {
          continue
        }

        const relativePath = img.getAttribute('data-src')
        if (!relativePath) continue

        try {
          const holo = getHoloApi()
          if (!holo) continue
          
          const result = await holo.loadImage(relativePath)
          if (result.ok) {
            img.setAttribute('src', result.dataUrl)
            img.setAttribute('data-loaded', 'true')
          }
        } catch (error) {
          console.error(`Failed to load image ${relativePath}:`, error)
        }
      }
    }

    loadImagesInEditor()
  }, [editorMode, activeTabPath, desktopApiAvailable, getHoloApi])

  const submitAiDialog = useAiDialogSubmission({
    aiDialog,
    setAiDialog,
    askAi,
    markdownToHtml,
    wysiwygEditorRef,
    aiSavedRangeRef,
    turndownService,
    updateActiveTabBody,
  })

  const {
    insertLinkIntoEditor,
    clearLinkSavedRange,
  } = useEditorLinkInsertion({
    wysiwygEditorRef,
    linkSavedRangeRef,
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
    wysiwygEditorRef,
    getNextTableDndId,
    imageDragDepthRef,
    setIsImageDragOverEditor,
    onEditorDragOver,
    handleImageFiles,
    isImageFile,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
    setColumnTypePopup,
  })

  const { onWysiwygInput } = useWysiwygInputHandler({
    wysiwygEditorRef,
    isSyncingWysiwygRef,
    isEditorReadOnly,
    getBlockTextBeforeCursor,
    slashMenu,
    setSlashMenu,
    turndownService,
    updateActiveTabBody,
    refreshTableSummaries,
  })

  const onRawDrop = useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
      if (isEditorReadOnly) {
        return
      }

      imageDragDepthRef.current = 0
      setIsImageDragOverEditor(false)
      const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile)
      if (imageFiles.length === 0) return
      event.preventDefault()
      const target = event.currentTarget
      const cursor = target.selectionStart ?? target.value.length
      void handleImageFiles(imageFiles, (mdImage) => {
        const next = target.value.slice(0, cursor) + mdImage + '\n' + target.value.slice(cursor)
        updateActiveTabBody(next)
      })
    },
    [handleImageFiles, isEditorReadOnly, isImageFile, updateActiveTabBody],
  )

  const onRawKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Tab' || isEditorReadOnly) {
        return
      }

      const target = event.currentTarget
      const result = applyMarkdownListTabBehavior(
        target.value,
        target.selectionStart ?? 0,
        target.selectionEnd ?? 0,
        event.shiftKey,
      )

      if (!result.handled) {
        return
      }

      event.preventDefault()

      if (result.nextText !== target.value) {
        updateActiveTabBody(result.nextText)
      }

      requestAnimationFrame(() => {
        const textarea = rawEditorRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd)
      })
    },
    [isEditorReadOnly, updateActiveTabBody],
  )


  const onWysiwygKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      if (handleWysiwygKeyGuards(event, editor)) {
        return
      }

      if (handleSlashMenuKeyboard(event, editor)) {
        return
      }

      if (handleWysiwygTabNavigation(event, editor)) {
        return
      }

      if (handleWysiwygStructuralKeys(event, editor)) {
        return
      }
    },
    [handleSlashMenuKeyboard, handleWysiwygKeyGuards, handleWysiwygStructuralKeys, handleWysiwygTabNavigation],
  )

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  useContextMenuDismiss({
    contextMenuOpen: contextMenu !== null,
    closeContextMenu,
  })

  const { moveNode, autoCommitStructuralChange } = useMoveNode({
    appAuthor,
    rootPath,
    selectedPath,
    activeTabPath,
    gitRepoEnabled: gitState.isRepo,
    ensureWritableMode,
    getHoloApi,
    refreshTree,
    refreshGitState,
    setActiveTab,
    setSelectedPath,
    setActiveTabPath,
    setDraggedPath,
    setDropTargetPath,
  })

  useEditorSelectionPopup({
    wysiwygEditorRef,
    setSelectionPopup,
    setTablePopup,
    setCodeBlockPopup,
  })

  useEditorOverlayEffects({
    aiDialog,
    aiTextareaRef,
    setCodeBlockPopup,
  })

  const formatReadonlyDate = useCallback((value?: string | null) => {
    if (!value) {
      return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return date.toLocaleString()
  }, [])

  const runWysiwygCommand = useCallback(
    (command: WysiwygCommand, value?: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      editor.focus()
      document.execCommand(command, false, value)
      onWysiwygInput()
    },
    [onWysiwygInput],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'

      if (!isSaveKey) {
        return
      }

      event.preventDefault()
      if (activeTab && !readOnlyMode) {
        void saveCurrentFile()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrentFile, activeTab, readOnlyMode])

  const scrollToHeading = useCallback((headingIndex: number) => {
    const editor = wysiwygEditorRef.current
    if (!editor) {
      return
    }

    const headings = Array.from(editor.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    const target = headings[headingIndex] as HTMLElement | undefined

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const onTocItemClick = useCallback(
    (headingIndex: number) => {
      if (editorMode === 'wysiwyg') {
        scrollToHeading(headingIndex)
        return
      }

      setEditorMode('wysiwyg')
      window.setTimeout(() => {
        scrollToHeading(headingIndex)
      }, 60)
    },
    [editorMode, scrollToHeading],
  )

  const {
    openCreateFileDialog,
    openCreateDirectoryDialog,
    openRenameDialog,
  } = useNameDialogActions({
    ensureWritableMode,
    rootPath,
    selectedPath,
    selectedType,
    setNameDialog,
  })

  const { submitNameDialog } = useNameDialogSubmission({
    ensureWritableMode,
    getHoloApi,
    nameDialog,
    rootPath,
    selectedPath,
    activeTabPath,
    appAuthor,
    refreshTree,
    refreshGitState,
    autoCommitStructuralChange,
    setNameDialog,
    setActiveTab,
    setActiveTabPath,
    setPendingTitleFocusPath,
    setSelectedPath,
  })

  const toggleTemplateStatus = useCallback(async (targetPath: string, nextValue: boolean) => {
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

      if (activeTab?.path === targetPath) {
        setActiveTab((prev) => (prev ? { ...prev, content: nextContent, isDirty: false } : prev))
      }

      setFileMetaByPath((prev) => {
        const currentMeta = prev[targetPath] ?? { title: '', description: '', isTemplate: false }

        if (!currentMeta.title && !currentMeta.description && !nextValue) {
          const next = { ...prev }
          delete next[targetPath]
          return next
        }

        return {
          ...prev,
          [targetPath]: {
            ...currentMeta,
            isTemplate: nextValue,
          },
        }
      })

      const stats = await holo.getPathStats(targetPath).catch(() => null)
      if (stats) {
        setPathStatsByPath((prev) => ({
          ...prev,
          [targetPath]: stats,
        }))
      }

      await refreshTree()
      await refreshGitState(false)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTab?.path, ensureWritableMode, getHoloApi, refreshGitState, refreshTree])

  const {
    archivePathTarget,
    restoreArchivedPathTarget,
    deletePathTarget,
    copyPathTarget,
  } = usePathTargetActions({
    ensureWritableMode,
    getHoloApi,
    rootPath,
    activeTabPath,
    appAuthor,
    requestConfirmation,
    refreshTree,
    refreshArchivedFiles,
    refreshGitState,
    autoCommitStructuralChange,
    setActiveTab,
    setActiveTabPath,
    setSelectedPath,
    setSelectedType,
  })

  const openTreeContextMenu = useCallback((node: TreeNode, position: { x: number; y: number }) => {
    setSelectedPath(node.path)
    setSelectedType(node.type)
    setContextMenu({ x: position.x, y: position.y, node })
  }, [])

  const runContextAction = useCallback((action: () => void) => {
    setContextMenu(null)
    action()
  }, [])

  const {
    openCommitDialog,
    openMergeDialog,
    submitGitDialog,
  } = useGitDialogActions({
    gitStateIsRepo: gitState.isRepo,
    gitDialog,
    setGitDialog,
    setIsGitBusy,
    getHoloApi,
    refreshGitState,
  })

  const conflictedFiles = normalizeGitState(gitState).conflictedFiles
  const gitAuthErrorActive = isLikelyGitAuthError(gitState.error)
    || (syncFeedback.status === 'error' && isLikelyGitAuthError(syncFeedback.message))
    || (syncFeedback.status === 'warning' && isLikelyGitAuthError(syncFeedback.message))

  const {
    openConflictedFile,
    copyHoloLink,
    openFileInNewWindow,
    closeOpenedFolder,
    submitAuthorProfile,
    logoutAuthorProfile,
  } = useWorkspaceUiActions({
    getHoloApi,
    rootPath,
    shareGatewayBaseUrl,
    openFile,
    setCopyLinkStatus,
    setSelectedPath,
    setSelectedType,
    setRootPath,
    setTree,
    setExpandedDirectories,
    setArchivedFiles,
    setActiveTab,
    setActiveTabPath,
    setGitState,
    setSyncFeedback,
    setContextMenu,
    setRepoImageStorageMode,
    setRepoImageModeReady,
    setFolderIconByPath,
    authorModalValue,
    setAppAuthor,
    setShowAuthorModal,
    setShowUserMenu,
    setAuthorModalMode,
    setAuthorModalValue,
  })

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
    linkSavedRangeRef,
    aiSavedRangeRef,
    wysiwygEditorRef,
    setSelectionPopup,
    setLinkDialog,
    setAiDialog,
    setColumnTypePopup,
    setCodeBlockPopup,
    setHoveredCodeBlock,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
    setShowCompactToc,
    onTocItemClick,
    readOnlyMode,
    setEditorMode,
    exportActiveFileToPdf,
    saveCurrentFile,
  })

  const {
    openCloneDialog,
    pickCloneDirectory,
    submitCloneDialog,
  } = useCloneWorkflow({
    cloneDialog,
    setCloneDialog,
    setGitState,
    getHoloApi,
    applyOpenedFolder,
    refreshRecentFolders,
  })

  return (
    <main
      className={`h-screen bg-[#242527] text-white rounded-lg font-sans ${isCompactLayout ? 'grid grid-cols-1 grid-rows-[64px_1fr]' : 'gap-x-2 grid grid-cols-[auto_1fr] grid-rows-[64px_1fr]'} overflow-hidden select-none`}
      style={{ gridTemplateAreas: isCompactLayout ? `'appbar' 'content'` : `'appbar appbar' 'sidebar content'` }}
    >

      {/* App header */}
      <AppHeader
        headerRef={headerRef}
        isCompactLayout={isCompactLayout}
        appVersion={appVersion}
        showTypeRBadge={showTypeRBadge}
        readOnlyMode={readOnlyMode}
        appAuthor={appAuthor}
        showUserMenu={showUserMenu}
        isSidebarOpenOnCompact={isSidebarOpenOnCompact}
        onHeaderMouseDown={onHeaderMouseDown}
        onToggleSidebar={() => setIsSidebarOpenOnCompact((previous) => !previous)}
        onToggleReadOnly={() => setReadOnlyMode((previous) => !previous)}
        onToggleUserMenu={() => setShowUserMenu((previous) => !previous)}
        onEditAuthor={() => {
          setAuthorModalMode('edit')
          setAuthorModalValue(appAuthor)
          setShowAuthorModal(true)
          setShowUserMenu(false)
        }}
        onLogout={logoutAuthorProfile}
        onDevTools={toggleDevTools}
        onMinimize={minimizeWindow}
        onMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
        onCloseUserMenuBackdrop={() => setShowUserMenu(false)}
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
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            
            {/* Titre du dossier */}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white/80 truncate">
                {rootPath ? `Dossier ${getBaseName(rootPath)}` : 'Aucun dossier'}
              </h2>
              {rootPath && (
                <button
                  className="size-6 shrink-0 rounded border border-white/10 text-white/55 hover:text-white hover:border-white/30 flex items-center justify-center"
                  onClick={closeOpenedFolder}
                  title="Fermer le dossier"
                >
                  <i className="fa-solid fa-xmark text-[10px]" />
                </button>
              )}
            </div>

            {rootPath && (
              <div className="space-y-2">
                <div className="flex items-center rounded border border-white/10 bg-[#242527] p-0.5">
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'explorer' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('explorer')}
                  >
                    Explorer
                  </button>
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'mine' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('mine')}
                  >
                    Mes fichiers
                  </button>
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'recent' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('recent')}
                  >
                    Récents
                  </button>
                </div>

                {filesSection === 'mine' && (
                  <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Auteur</p>
                    <input
                      className="w-full rounded bg-transparent px-1 py-0.5 text-xs text-white/80 outline-none placeholder:text-white/25"
                      value={appAuthor}
                      onChange={(event) => setAppAuthor(event.target.value)}
                      placeholder="Nom de l'auteur"
                    />
                  </div>
                )}
              </div>
            )}

            {!rootPath && (
              <div className="rounded-2xl border border-[#7B61FF]/30 bg-gradient-to-b from-[#2b2450]/35 to-[#1f2021] p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9d8bff]">Démarrer</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded px-2.5 py-1.5 text-xs font-medium bg-[#7B61FF] text-white hover:bg-[#6D4FD8]"
                    onClick={() => void openFolder()}
                    title="Ouvrir un dossier"
                  >
                    <i className="fa-solid fa-folder-open mr-1" />
                    Ouvrir un dossier
                  </button>
                  <button
                    className="rounded px-2.5 py-1.5 text-xs font-medium border border-white/15 text-white/85 hover:bg-white/10"
                    onClick={() => {
                      openCloneDialog()
                    }}
                    title="Cloner un dépôt Git"
                  >
                    <i className="fa-solid fa-code-branch mr-1" />
                    Cloner un dépôt
                  </button>
                </div>
              </div>
            )}

            {!rootPath && recentFolders.length > 0 && (
              <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Récents</p>
                <ul className="space-y-1">
                  {recentFolders.map((folderPath) => {
                    const isActive = rootPath === folderPath

                    return (
                      <li key={folderPath}>
                        <div className={`flex items-center gap-1 rounded ${isActive ? 'bg-[#7B61FF]/20' : 'hover:bg-white/8'}`}>
                          <button
                            className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs ${isActive ? 'text-[#7B61FF]' : 'text-white/70 hover:text-white'}`}
                            onClick={() => {
                              void openRecentFolder(folderPath)
                            }}
                            title={folderPath}
                          >
                            <span className="w-4 shrink-0 text-center text-sm leading-none">
                              {recentFolderIconByPath[folderPath] ? (
                                <span>{recentFolderIconByPath[folderPath]}</span>
                              ) : (
                                <i className="fa-regular fa-folder" />
                              )}
                            </span>
                            <span className="truncate">{getBaseName(folderPath)}</span>
                          </button>

                          <button
                            className="mr-1 size-5 shrink-0 rounded text-white/45 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center"
                            onClick={(event) => {
                              event.stopPropagation()
                              void removeRecentFolder(folderPath)
                            }}
                            title="Retirer des récents"
                          >
                            <i className="fa-solid fa-xmark text-[9px]" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Contenu section Explorer */}
            {filesSection === 'explorer' && tree ? (
              <ul className="space-y-0.5 flex-1 overflow-auto">
                <ExplorerTreeItem
                  node={tree!}
                  selectedPath={selectedPath}
                  fileIconByPath={fileIconByPath}
                  folderIconByPath={folderIconByPath}
                  fileMetaByPath={fileMetaByPath}
                  onSelect={onSelectNode}
                  onContextMenu={openTreeContextMenu}
                  expandedDirectories={expandedDirectories}
                  onToggleDirectory={toggleDirectory}
                  draggedPath={draggedPath}
                  dropTargetPath={dropTargetPath}
                  onDragStart={(node) => setDraggedPath(node.path)}
                  onDragEnd={() => {
                    setDraggedPath(null)
                    setDropTargetPath(null)
                  }}
                  onDragOverDirectory={(node) => {
                    if (!draggedPath || draggedPath === node.path || isSameOrChildPath(draggedPath, node.path)) {
                      return
                    }

                    setDropTargetPath(node.path)
                  }}
                  onDragLeaveDirectory={(node) => {
                    if (dropTargetPath === node.path) {
                      setDropTargetPath(null)
                    }
                  }}
                  onDropOnDirectory={(node) => {
                    if (!draggedPath) {
                      return
                    }

                    void moveNode(draggedPath, node.path)
                  }}
                />
              </ul>
            ) : filesSection === 'mine' && rootPath ? (
              <div className="flex-1 overflow-auto">
                {!appAuthor.trim() ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Renseigne un auteur pour afficher Mes fichiers.
                  </p>
                ) : myFilePaths.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Aucun fichier trouvé pour l'auteur “{appAuthor}”.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {myFilePaths.map((filePath) => (
                      <li key={filePath}>
                        <button
                          className={`w-full truncate rounded px-2 py-1 text-left text-xs ${selectedPath === filePath ? 'bg-[#7B61FF]/20 text-[#9d8bff]' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                          onClick={() => {
                            void openFile(filePath)
                          }}
                          title={filePath}
                        >
                          {getBaseName(filePath).replace(/\.md$/i, '')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : filesSection === 'recent' && rootPath ? (
              <div className="flex-1 overflow-auto">
                {visibleRecentFilePaths.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Aucun fichier récent.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {visibleRecentFilePaths.map((filePath) => (
                      <li key={filePath}>
                        <button
                          className={`w-full truncate rounded px-2 py-1 text-left text-xs ${selectedPath === filePath ? 'bg-[#7B61FF]/20 text-[#9d8bff]' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                          onClick={() => {
                            setSelectedPath(filePath)
                            setSelectedType('file')
                            void openFile(filePath)
                          }}
                          title={filePath}
                        >
                          {getBaseName(filePath).replace(/\.md$/i, '')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : !rootPath && recentFolders.length > 0 ? null : (
              <p className="text-xs text-white/40 text-center py-8">
                {desktopApiAvailable ? 'Ouvre un dossier pour commencer' : 'API Electron indisponible'}
              </p>
            )}
          </nav>
        )}

        {/* Panel Recherche */}
        {activeSidebar === 'search' && (
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            <h2 className="text-sm font-semibold text-white/80">🔍 Recherche</h2>

            {/* Input */}
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none" />
              <input
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/25"
                placeholder="Rechercher… ou #tag"
                value={searchQuery}
                onChange={(e) => {
                  onSearchInput(e.target.value)
                }}
              />
              {searchQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                  onClick={clearSearch}
                >
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              )}
            </div>

            {/* Hint */}
            {!searchQuery && (
              <p className="text-xs text-white/25 leading-relaxed">
                Tape du texte pour chercher dans le contenu, ou <span className="text-[#9d8bff]">#tag</span> pour filtrer par étiquette.
              </p>
            )}

            {/* Loading */}
            {isSearching && (
              <p className="text-xs text-white/35 animate-pulse">Recherche en cours…</p>
            )}

            {/* No results */}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <p className="text-xs text-white/30">Aucun résultat pour « {searchQuery} »</p>
            )}

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">{searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}</p>
                {searchResults.map((result) => (
                  <button
                    key={result.path}
                    className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors border border-transparent hover:border-white/8"
                    onClick={() => {
                      if (result.isArchived) {
                        window.alert('Ce fichier est archivé. Fais un clic droit puis “Récupérer depuis archive”.')
                        return
                      }

                      const node: TreeNode = { name: getBaseName(result.path), path: result.path, type: 'file' }
                      onSelectNode(node)
                      setActiveSidebar('files')
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      openTreeContextMenu(
                        {
                          name: getBaseName(result.path),
                          path: result.path,
                          type: 'file',
                          archivedOriginalPath: result.isArchived ? result.originalPath : undefined,
                        },
                        { x: event.clientX, y: event.clientY },
                      )
                    }}
                  >
                    <span className="text-sm font-medium text-white truncate">
                      {result.name}
                      {result.isArchived && <span className="ml-2 text-[10px] text-amber-300">ARCHIVE</span>}
                    </span>
                    <span className={`text-xs truncate ${result.matchType === 'tag' ? 'text-[#9d8bff]' : result.matchType === 'archive' ? 'text-amber-200/80' : 'text-white/40'}`}>
                      {result.excerpt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </nav>
        )}

        {/* Panel Git */}
        {activeSidebar === 'git' && (
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            
            {/* Titre */}
            <div>
              <h2 className="text-sm font-semibold text-white/80">
                🌿 Git
              </h2>
            </div>

            {/* Contenu selon état du repo */}
            {!rootPath ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ouvre un dossier pour utiliser Git
              </p>
            ) : !gitState.isRepo ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ce dossier n'est pas un dépôt Git
              </p>
            ) : (
              <>
                {/* Branche et indicateurs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Branche</span>
                    <span className="text-xs font-semibold text-[#7B61FF]">{gitState.branch ?? '?'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Local</div>
                      <div className="text-xs font-bold text-white/80">✏️ {gitState.localChanges}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Sortants</div>
                      <div className="text-xs font-bold text-white/80">⬆️ {gitState.outgoing}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Entrants</div>
                      <div className="text-xs font-bold text-white/80">⬇️ {gitState.incoming}</div>
                    </div>
                  </div>
                </div>

                {/* Bouton Synchroniser */}
                <button
                  className="px-3 py-2 rounded text-xs font-bold bg-[#7B61FF] text-white hover:bg-[#6D4FD8] disabled:opacity-50 disabled:bg-[#7B61FF]/50 flex items-center justify-center gap-2"
                  onClick={() => void syncRepository()}
                  disabled={isGitBusy}
                  title="Synchroniser avec le dépôt distant"
                >
                  {isGitBusy ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-xs" />
                      Synchro...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-arrows-rotate text-xs" />
                      Synchroniser
                    </>
                  )}
                </button>

                {/* Boutons secondaires */}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openCommitDialog}
                    disabled={isGitBusy || gitState.localChanges === 0}
                    title="Créer un commit"
                  >
                    <i className="fa-solid fa-check mr-1" />
                    Commit
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void pullChanges()}
                    disabled={isGitBusy}
                    title="Tirer les changements"
                  >
                    <i className="fa-solid fa-arrow-down mr-1" />
                    Pull
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openMergeDialog}
                    disabled={isGitBusy}
                    title="Fusionner une branche"
                  >
                    <i className="fa-solid fa-code-merge mr-1" />
                    Merge
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void fetchChanges()}
                    disabled={isGitBusy}
                    title="Récupérer les changements distants"
                  >
                    <i className="fa-solid fa-download mr-1" />
                    Fetch
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void refreshGitState(false)}
                    disabled={isGitBusy}
                    title="Rafraîchir l'état Git"
                  >
                    <i className="fa-solid fa-arrow-rotate-right mr-1" />
                    Raf.
                  </button>
                </div>

                {/* Feedback de synchro */}
                {syncFeedback.message && (
                  <div
                    className={`rounded px-3 py-2 text-xs space-y-1 ${
                      syncFeedback.status === 'success'
                        ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-200'
                        : syncFeedback.status === 'warning'
                          ? 'bg-amber-900/30 border border-amber-700/50 text-amber-200'
                          : 'bg-red-900/30 border border-red-700/50 text-red-200'
                    }`}
                  >
                    <p className="font-medium text-[10px] leading-tight">{syncFeedback.message}</p>
                    {syncFeedback.at && (
                      <p className="text-[9px] opacity-60">
                        {new Date(syncFeedback.at!).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Erreur Git */}
                {gitState.error && (
                  <div className="rounded px-3 py-2 text-xs bg-red-900/30 border border-red-700/50 text-red-200">
                    <p className="font-medium text-[10px]">{gitState.error}</p>
                  </div>
                )}

                {gitAuthErrorActive && (
                  <div className="rounded px-3 py-2 text-xs border border-amber-700/50 bg-amber-900/20 text-amber-100">
                    <p className="font-medium text-[10px]">
                      Problème d’authentification détecté.
                    </p>
                    <p className="mt-1 text-[10px] text-amber-200/85">
                      Les identifiants Git ne sont pas saisis dans Holo : ils sont gérés par Git (SSH / Credential Manager du système).
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-400/15"
                        onClick={() => setShowGitAuthHelp(true)}
                      >
                        Aide connexion
                      </button>
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-[10px] text-white/85 hover:bg-white/10"
                        onClick={() => setShowSettings(true)}
                      >
                        Ouvrir paramètres
                      </button>
                    </div>
                  </div>
                )}

                {/* Last fetch */}
                {gitState.lastFetchAt && (
                  <p className="text-[10px] text-white/40 text-center">
                    Fetch: {new Date(gitState.lastFetchAt).toLocaleTimeString()}
                  </p>
                )}

                {/* Conflicted files */}
                {conflictedFiles.length > 0 && (
                  <div className="rounded px-3 py-2 border border-amber-700/50 bg-amber-900/20 space-y-2">
                    <p className="text-[10px] font-bold text-amber-200">
                      ⚠️ {conflictedFiles.length} conflit(s)
                    </p>
                    <ul className="space-y-1">
                      {conflictedFiles.map((filePath) => (
                        <li key={filePath}>
                          <div className="rounded border border-amber-700/30 bg-white/5 p-1.5">
                            <button
                              className="mb-1 w-full truncate rounded px-1.5 py-1 text-left text-[9px] text-amber-100 hover:bg-amber-900/20"
                              onClick={() => void openConflictedFile(filePath)}
                              title={filePath}
                            >
                              {getBaseName(filePath)}
                            </button>
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                className="rounded border border-emerald-600/40 bg-emerald-900/20 px-1.5 py-1 text-[9px] text-emerald-100 hover:bg-emerald-800/30 disabled:opacity-50"
                                onClick={() => void resolveConflictChoice(filePath, 'ours')}
                                disabled={isGitBusy}
                                title="Garder ta version locale"
                              >
                                Garder local
                              </button>
                              <button
                                className="rounded border border-sky-600/40 bg-sky-900/20 px-1.5 py-1 text-[9px] text-sky-100 hover:bg-sky-800/30 disabled:opacity-50"
                                onClick={() => void resolveConflictChoice(filePath, 'theirs')}
                                disabled={isGitBusy}
                                title="Prendre la version du serveur"
                              >
                                Prendre serveur
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </nav>
        )}

      </AppSidebar>

      {/* Zone d'édition principale */}
      <section className="flex min-w-0 min-h-0 flex-col bg-[#292929]" style={{ gridArea: 'content' }}>
          {/* Éditeur */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col">
            {activeTab ? (
              <>
                <EditorTopBar
                  isCompactLayout={isCompactLayout}
                  activeTabIsDirty={activeTab.isDirty}
                  readOnlyMode={readOnlyMode}
                  effectiveEditorMode={effectiveEditorMode}
                  saveStatus={saveStatus}
                  copyLinkStatus={copyLinkStatus}
                  tocItems={tocItems}
                  showCompactToc={showCompactToc}
                  compactTocRef={compactTocRef}
                  onToggleCompactToc={onToggleCompactToc}
                  onCompactTocItemClick={onCompactTocItemClick}
                  onSwitchRaw={onEditorSwitchRaw}
                  onSwitchWysiwyg={onEditorSwitchWysiwyg}
                  onExportPdf={onEditorExportPdf}
                  onCopyLink={() => { void copyHoloLink(activeTab.path) }}
                  onSave={onEditorSave}
                />

                <EditorCanvas
                  isCompactLayout={isCompactLayout}
                  effectiveEditorMode={effectiveEditorMode}
                  isEditorReadOnly={isEditorReadOnly}
                  activeTabBody={activeTabBody}
                  rawEditorRef={rawEditorRef}
                  wysiwygEditorRef={wysiwygEditorRef}
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
                  setColumnTypePopup={setColumnTypePopup}
                  isImageDragOverEditor={isImageDragOverEditor}
                  remoteEditBlock={remoteEditBlock}
                  onPullNow={onPullNow}
                  codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
                  setHoveredCodeBlock={setHoveredCodeBlock}
                  documentHeaderProps={{
                    isCompactLayout,
                    editableHeader,
                    isEditorReadOnly,
                    showEmojiPicker,
                    setShowEmojiPicker,
                    titleInputRef,
                    activePathStats,
                    formatReadonlyDate,
                    updateEditableHeader,
                    updateTags,
                    showTagInput,
                    setShowTagInput,
                    tagInput,
                    setTagInput,
                  }}
                />
                
                <EditorOverlays
                  editorMode={editorMode}
                  selectionPopup={selectionPopup}
                  runWysiwygCommand={runWysiwygCommand}
                  onOpenLinkFromSelection={onOpenLinkFromSelection}
                  hasAiProviderConfigured={hasAiProviderConfigured}
                  onOpenAiTransformFromSelection={onOpenAiTransformFromSelection}
                  tablePopup={tablePopup}
                  columnTypePopup={columnTypePopup}
                  insertTableRow={insertTableRow}
                  insertTableColumn={insertTableColumn}
                  sortTableByCurrentColumn={sortTableByCurrentColumn}
                  openCurrentColumnTypePicker={openCurrentColumnTypePicker}
                  deleteTableRow={deleteTableRow}
                  deleteTableColumn={deleteTableColumn}
                  setCurrentColumnType={setCurrentColumnType}
                  onCloseColumnTypePopup={onCloseColumnTypePopup}
                  hoveredCodeBlock={hoveredCodeBlock}
                  codeBlockPopup={codeBlockPopup}
                  codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
                  setHoveredCodeBlock={setHoveredCodeBlock}
                  setCodeBlockPopup={setCodeBlockPopup}
                  formatCodeBlock={formatCodeBlock}
                  onApplyCodeLanguage={onApplyCodeLanguage}
                  slashMenu={slashMenu}
                  slashMenuListRef={slashMenuListRef}
                  slashMenuIndex={slashMenuIndex}
                  slashCommands={SLASH_COMMANDS}
                  matchesSlashQuery={matchesSlashQuery}
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

      <AiDialogModal
        aiDialog={aiDialog}
        aiTextareaRef={aiTextareaRef}
        onSetAiDialog={setAiDialog}
        onSubmitAiDialog={() => { void submitAiDialog() }}
        onClose={() => {
          setAiDialog(null)
          aiSavedRangeRef.current = null
        }}
      />

      {contextMenu && (
        <div
          className="fixed z-20 min-w-[180px] rounded-lg border border-white/10 bg-[#1b1c1d] p-1.5 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {(() => {
            const isArchivedContext = Boolean(contextMenu.node.archivedOriginalPath)

            return (
              <>
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
            {contextMenu.node.type === 'directory' ? 'Dossier' : isArchivedContext ? 'Fichier archivé' : 'Fichier'} · {contextMenu.node.name}
          </div>

          {!isArchivedContext && (
            <>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => openCreateFileDialog(contextMenu.node.path, contextMenu.node.type))}
              >
                <i className="fa-solid fa-file-plus w-4 text-center" />
                Nouveau fichier
              </button>

              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => openCreateDirectoryDialog(contextMenu.node.path, contextMenu.node.type))}
              >
                <i className="fa-solid fa-folder-plus w-4 text-center" />
                Nouveau dossier
              </button>
            </>
          )}

          {!isArchivedContext && contextMenu.node.type === 'directory' && (
            <>
              <div className="my-1 h-px bg-white/8" />
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => setShowFolderIconPicker(contextMenu.node.path))}
              >
                <i className="fa-regular fa-face-smile w-4 text-center" />
                Changer l'icône
              </button>
            </>
          )}

          {contextMenu.node.path !== rootPath && (
            <>
              <div className="my-1 h-px bg-white/8" />

              {!isArchivedContext && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => openRenameDialog(contextMenu.node.path))}
                >
                  <i className="fa-solid fa-pen w-4 text-center" />
                  Renommer
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <div className="my-1 h-px bg-white/8" />
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void toggleTemplateStatus(
                      contextMenu.node.path,
                      !fileMetaByPath[contextMenu.node.path]?.isTemplate,
                    )
                  })}
                >
                  <i className="fa-solid fa-layer-group w-4 text-center" />
                  {fileMetaByPath[contextMenu.node.path]?.isTemplate ? 'Retirer du modèle' : 'Définir comme modèle'}
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void copyHoloLink(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-link w-4 text-center" />
                  Copier le lien
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void copyPathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-copy w-4 text-center" />
                  Dupliquer
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void openFileInNewWindow(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-up-right-from-square w-4 text-center" />
                  Ouvrir dans une nouvelle fenêtre
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                  onClick={() => runContextAction(() => {
                    void archivePathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-box-archive w-4 text-center" />
                  Archiver
                </button>
              )}

              {isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                  onClick={() => runContextAction(() => {
                    void restoreArchivedPathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-box-open w-4 text-center" />
                  Récupérer depuis archive
                </button>
              )}

              {!isArchivedContext && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  onClick={() => runContextAction(() => {
                    void deletePathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-trash w-4 text-center" />
                  Supprimer
                </button>
              )}
            </>
          )}
              </>
            )
          })()}
        </div>
      )}

      {showFolderIconPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-regular fa-face-smile text-[#7B61FF]" />
                Changer l'icône du dossier
              </h2>
              <button
                className="text-white/40 hover:text-white transition-colors"
                onClick={() => setShowFolderIconPicker(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/50">Choisir une icône</span>
                {folderIconByPath[showFolderIconPicker] && (
                  <button
                    className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/8 hover:text-white/70"
                    onClick={() => {
                      void saveFolderIconConfig(showFolderIconPicker, '')
                      setShowFolderIconPicker(null)
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-white/10 bg-[#141515] p-2">
                <EmojiPicker
                  width={380}
                  height={380}
                  theme={Theme.DARK}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => {
                    void saveFolderIconConfig(showFolderIconPicker, emojiData.emoji)
                    setShowFolderIconPicker(null)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}


      <SettingsModal
        showSettings={showSettings}
        onClose={() => setShowSettings(false)}
        appAuthor={appAuthor}
        onSetAppAuthor={setAppAuthor}
        gitEmail={gitEmail}
        onSetGitEmail={setGitEmail}
        rootPath={rootPath}
        repoImageStorageMode={repoImageStorageMode}
        onSetRepoImageStorageMode={setRepoImageStorageMode}
        azureBlobContainerUrl={azureBlobContainerUrl}
        onSetAzureBlobContainerUrl={setAzureBlobContainerUrl}
        azureBlobSasToken={azureBlobSasToken}
        onSetAzureBlobSasToken={setAzureBlobSasToken}
        s3Region={s3Region}
        onSetS3Region={setS3Region}
        s3Bucket={s3Bucket}
        onSetS3Bucket={setS3Bucket}
        s3AccessKeyId={s3AccessKeyId}
        onSetS3AccessKeyId={setS3AccessKeyId}
        s3SecretAccessKey={s3SecretAccessKey}
        onSetS3SecretAccessKey={setS3SecretAccessKey}
        s3Endpoint={s3Endpoint}
        onSetS3Endpoint={setS3Endpoint}
        s3PublicBaseUrl={s3PublicBaseUrl}
        onSetS3PublicBaseUrl={setS3PublicBaseUrl}
        dropboxAccessToken={dropboxAccessToken}
        onSetDropboxAccessToken={setDropboxAccessToken}
        dropboxFolderPath={dropboxFolderPath}
        onSetDropboxFolderPath={setDropboxFolderPath}
        gdriveAccessToken={gdriveAccessToken}
        onSetGdriveAccessToken={setGdriveAccessToken}
        gdriveFolderId={gdriveFolderId}
        onSetGdriveFolderId={setGdriveFolderId}
        repoImageModeReady={repoImageModeReady}
        onSaveRepoImageConfig={() => { void saveRepoImageConfig() }}
        aiProvider={aiProvider}
        onSetAiProvider={setAiProvider}
        geminiApiKey={geminiApiKey}
        onSetGeminiApiKey={setGeminiApiKey}
        openaiApiKey={openaiApiKey}
        onSetOpenaiApiKey={setOpenaiApiKey}
        openaiPrompt={openaiPrompt}
        onSetOpenaiPrompt={setOpenaiPrompt}
        appVersion={appVersion}
        currentVersionChangelog={currentVersionChangelog}
        seenChangelogVersion={seenChangelogVersion}
        changelogEntries={CHANGELOG_ENTRIES}
        onOpenChangelog={openChangelog}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        onCheckForUpdates={() => { void window.holo?.checkForUpdates() }}
        onInstallUpdate={() => { void window.holo?.installUpdate() }}
        shareGatewayBaseUrl={shareGatewayBaseUrl}
        onSetShareGatewayBaseUrl={setShareGatewayBaseUrl}
        showAuthorModal={showAuthorModal}
        authorModalMode={authorModalMode}
        authorModalValue={authorModalValue}
        onSetAuthorModalValue={setAuthorModalValue}
        onCloseAuthorModal={() => setShowAuthorModal(false)}
        onSubmitAuthorProfile={submitAuthorProfile}
      />
      <AppModals
        showChangelogModal={showChangelogModal}
        selectedChangelogEntry={selectedChangelogEntry ?? null}
        appVersion={appVersion}
        onCloseChangelog={closeChangelog}
        onMarkChangelogSeen={markCurrentVersionChangelogAsSeen}
        showUnsavedChangesModal={showUnsavedChangesModal}
        onCancelUnsaved={cancelDiscardAndSwitchFile}
        onConfirmUnsaved={() => { void confirmDiscardAndSwitchFile() }}
        confirmDialog={confirmDialog}
        onResolveConfirm={resolveConfirmationDialog}
        linkDialog={linkDialog}
        linkPageSuggestions={linkPageSuggestions}
        onSetLinkDialog={setLinkDialog}
        onClearLinkSavedRange={clearLinkSavedRange}
        onInsertLink={insertLinkIntoEditor}
        onLinkSuggestionClick={(filePath) => {
          if (!linkDialog) return
          const relativePath = getRelativeLinkPath(activeTabPath, filePath, rootPath)
          const label = getBaseName(filePath).replace(/\.md$/i, '')
          setLinkDialog({
            ...linkDialog,
            url: relativePath,
            text: linkDialog.text.trim() ? linkDialog.text : label,
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
        nameDialog={nameDialog}
        templateOptions={templateOptions}
        onSetNameDialog={setNameDialog}
        onSubmitNameDialog={() => { void submitNameDialog() }}
        cloneDialog={cloneDialog}
        onSetCloneDialog={setCloneDialog}
        onSubmitCloneDialog={() => { void submitCloneDialog() }}
        onPickCloneDirectory={() => { void pickCloneDirectory() }}
        gitDialog={gitDialog}
        onSetGitDialog={setGitDialog}
        onSubmitGitDialog={() => { void submitGitDialog() }}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        updateProgress={updateProgress}
        onDismissUpdate={dismissUpdate}
        onInstallUpdate={() => { void window.holo?.installUpdate() }}
      />
    </main>
  )
}

export default App
