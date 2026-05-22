import { useState } from 'react'
import type { EditorContextType, OpenTab } from '../contexts/EditorContext'
import type { WorkspaceContextType } from '../contexts/WorkspaceContext'
import type { UIContextType } from '../contexts/UIContext'
import type { ConfigContextType } from '../contexts/ConfigContext'
import type { TreeNode, NodeType, FileMeta } from '../types/app'
import type { FilePathStats } from '../types/editor'
import type { ImageStorageMode } from './useRepoImageSettings'
import type { GitState, RemoteEditBlock } from '../types/git'
import { DEFAULT_GIT_STATE } from '../lib/gitUtils'
import type { NameDialog, GitDialog, CloneDialog, LinkDialogState } from '../types/shared'
import { DEFAULT_SYNC_FEEDBACK } from './useGitWorkflow'

/**
 * Hook that aggregates all state management for App.tsx
 * Returns context values for EditorContext, WorkspaceContext, UIContext, and ConfigContext
 */
export function useAppState() {
  // ========== EDITOR STATE ==========
  const [activeTab, setActiveTab] = useState<OpenTab | null>(null)
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'raw' | 'wysiwyg'>('wysiwyg')
  const [selectionPopup, setSelectionPopup] = useState(null)
  const [tablePopup, setTablePopup] = useState(null)
  const [codeBlockPopup, setCodeBlockPopup] = useState(null)
  const [columnTypePopup, setColumnTypePopup] = useState(null)
  const [hoveredCodeBlock, setHoveredCodeBlock] = useState(null)
  const [slashMenu, setSlashMenu] = useState(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const [showCompactToc, setShowCompactToc] = useState(false)
  const [isImageDragOverEditor, setIsImageDragOverEditor] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [readOnlyMode, setReadOnlyMode] = useState(false)

  // ========== WORKSPACE STATE ==========
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState(new Set<string>())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [recentFolders, setRecentFolders] = useState<string[]>([])
  const [recentFilePaths, setRecentFilePaths] = useState<string[]>([])
  const [recentFolderIconByPath, setRecentFolderIconByPath] = useState<Record<string, string>>({})
  const [fileIconByPath, setFileIconByPath] = useState<Record<string, string>>({})
  const [folderIconByPath, setFolderIconByPath] = useState<Record<string, string>>({})
  const [fileMetaByPath, setFileMetaByPath] = useState<Record<string, FileMeta>>({})
  const [pathStatsByPath, setPathStatsByPath] = useState<Record<string, FilePathStats>>({})
  const [archivedFiles, setArchivedFiles] = useState<any[]>([])
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git' | 'search'>('files')
  const [filesSection, setFilesSection] = useState<'explorer' | 'mine' | 'recent'>('explorer')
  const [contextMenu, setContextMenu] = useState(null)

  // ========== UI STATE ==========
  const [showSettings, setShowSettings] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [showAuthorModal, setShowAuthorModal] = useState(false)
  const [authorModalMode, setAuthorModalMode] = useState<'startup' | 'edit'>('startup')
  const [authorModalValue, setAuthorModalValue] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [gitDialog, setGitDialog] = useState<GitDialog | null>(null)
  const [cloneDialog, setCloneDialog] = useState<CloneDialog | null>(null)
  const [showGitAuthHelp, setShowGitAuthHelp] = useState(false)
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'synced' | 'local'>('idle')
  const [copyLinkStatus, setCopyLinkStatus] = useState<'idle' | 'copied'>('idle')
  const [seenChangelogVersion, setSeenChangelogVersion] = useState('')
  const [globalConfigReady, setGlobalConfigReady] = useState(false)
  const [pendingFileSwitchPath, setPendingFileSwitchPath] = useState<string | null>(null)
  const [showFolderIconPicker, setShowFolderIconPicker] = useState<string | null>(null)

  // ========== CONFIG STATE ==========
  const [appAuthor, setAppAuthor] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [gitState, setGitState] = useState<GitState>(DEFAULT_GIT_STATE)
  const [isGitBusy, setIsGitBusy] = useState(false)
  const [remoteEditBlock, setRemoteEditBlock] = useState<RemoteEditBlock>({
    isBlocked: false,
    message: '',
  })
  const [syncFeedback, setSyncFeedback] = useState(DEFAULT_SYNC_FEEDBACK)
  
  // Image Storage Configuration
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
  
  // AI Configuration
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'auto' | 'openai' | 'gemini'>('auto')
  const [openaiPrompt, setOpenaiPrompt] = useState('Tu es un assistant qui aide à rédiger de la documentation technique en Markdown. Réponds toujours en Markdown bien structuré, avec des titres, listes et code blocks si nécessaire.')
  
  // Share Gateway
  const [shareGatewayBaseUrl, setShareGatewayBaseUrl] = useState('https://holo-link-gateway-git-main-romanedonnet-8817s-projects.vercel.app')

  // Return context values for all 4 contexts
  const editorContext: EditorContextType = {
    activeTab,
    setActiveTab,
    activeTabPath,
    setActiveTabPath,
    editorMode,
    setEditorMode,
    selectionPopup,
    setSelectionPopup,
    tablePopup,
    setTablePopup,
    codeBlockPopup,
    setCodeBlockPopup,
    columnTypePopup,
    setColumnTypePopup,
    hoveredCodeBlock,
    setHoveredCodeBlock,
    slashMenu,
    setSlashMenu,
    slashMenuIndex,
    setSlashMenuIndex,
    showCompactToc,
    setShowCompactToc,
    isImageDragOverEditor,
    setIsImageDragOverEditor,
    showEmojiPicker,
    setShowEmojiPicker,
    readOnlyMode,
    setReadOnlyMode,
  }

  const workspaceContext: WorkspaceContextType = {
    rootPath,
    setRootPath,
    tree,
    setTree,
    expandedDirectories,
    setExpandedDirectories,
    selectedPath,
    setSelectedPath,
    selectedType,
    setSelectedType,
    draggedPath,
    setDraggedPath,
    dropTargetPath,
    setDropTargetPath,
    recentFolders,
    setRecentFolders,
    recentFilePaths,
    setRecentFilePaths,
    recentFolderIconByPath,
    setRecentFolderIconByPath,
    fileIconByPath,
    setFileIconByPath,
    folderIconByPath,
    setFolderIconByPath,
    fileMetaByPath,
    setFileMetaByPath,
    pathStatsByPath,
    setPathStatsByPath,
    archivedFiles,
    setArchivedFiles,
    activeSidebar,
    setActiveSidebar,
    filesSection,
    setFilesSection,
    contextMenu,
    setContextMenu,
  }

  const uiContext: UIContextType = {
    showSettings,
    setShowSettings,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    showAuthorModal,
    setShowAuthorModal,
    authorModalMode,
    setAuthorModalMode,
    authorModalValue,
    setAuthorModalValue,
    showUserMenu,
    setShowUserMenu,
    nameDialog,
    setNameDialog,
    gitDialog,
    setGitDialog,
    cloneDialog,
    setCloneDialog,
    showGitAuthHelp,
    setShowGitAuthHelp,
    linkDialog,
    setLinkDialog,
    tagInput,
    setTagInput,
    showTagInput,
    setShowTagInput,
    saveStatus,
    setSaveStatus,
    copyLinkStatus,
    setCopyLinkStatus,
    seenChangelogVersion,
    setSeenChangelogVersion,
    globalConfigReady,
    setGlobalConfigReady,
    pendingFileSwitchPath,
    setPendingFileSwitchPath,
    showFolderIconPicker,
    setShowFolderIconPicker,
  }

  const configContext: ConfigContextType = {
    appAuthor,
    setAppAuthor,
    readOnlyMode,
    setReadOnlyMode,
    gitEmail,
    setGitEmail,
    gitState,
    setGitState,
    isGitBusy,
    setIsGitBusy,
    remoteEditBlock,
    setRemoteEditBlock,
    syncFeedback,
    setSyncFeedback,
    repoImageModeReady,
    setRepoImageModeReady,
    repoImageStorageMode,
    setRepoImageStorageMode,
    azureBlobContainerUrl,
    setAzureBlobContainerUrl,
    azureBlobSasToken,
    setAzureBlobSasToken,
    s3Region,
    setS3Region,
    s3Bucket,
    setS3Bucket,
    s3AccessKeyId,
    setS3AccessKeyId,
    s3SecretAccessKey,
    setS3SecretAccessKey,
    s3Endpoint,
    setS3Endpoint,
    s3PublicBaseUrl,
    setS3PublicBaseUrl,
    dropboxAccessToken,
    setDropboxAccessToken,
    dropboxFolderPath,
    setDropboxFolderPath,
    gdriveAccessToken,
    setGdriveAccessToken,
    gdriveFolderId,
    setGdriveFolderId,
    openaiApiKey,
    setOpenaiApiKey,
    geminiApiKey,
    setGeminiApiKey,
    aiProvider,
    setAiProvider,
    openaiPrompt,
    setOpenaiPrompt,
    shareGatewayBaseUrl,
    setShareGatewayBaseUrl,
  }

  return { editorContext, workspaceContext, uiContext, configContext }
}
