type NodeType = 'file' | 'directory'

type TreeNode = {
  name: string
  path: string
  type: NodeType
  children?: TreeNode[]
}

type OpenFolderResult = {
  rootPath: string
  tree: TreeNode
} | null

type HoloGitState = {
  isRepo: boolean
  hasRemote: boolean
  branch: string | null
  localChanges: number
  incoming: number
  outgoing: number
  conflictedFiles: string[]
  operationInProgress: 'rebase' | 'merge' | 'none'
  lastFetchAt: string | null
  error: string | null
}

type HoloGitCommitResult = {
  ok: true
  committed: true
  pushed: boolean
  output: string
  pushError: string | null
}

type HoloGitFileCommit = {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  timestamp: string
  subject: string
}

type HoloGitFileActivity = HoloGitFileCommit & {
  added: number
  deleted: number
  additionsPreview: string[]
  deletionsPreview: string[]
  commitUrl: string | null
}

type HoloGitContributor = {
  commitCount: number
  authorName: string
  authorEmail: string
}

type HoloGitSyncResult = {
  ok: true
  committed: boolean
  pulled: boolean
  pushed: boolean
  hadConflicts: boolean
  conflictedFiles: string[]
  commitMessage: string | null
  error: string | null
}

type HoloGitPullIfSafeResult = {
  ok: boolean
  pulled: boolean
  pushed?: boolean
  reason: 'no-root' | 'not-a-repo' | 'no-remote' | 'operation-in-progress' | 'fetch-failed' | 'up-to-date' | 'pushed' | 'push-failed' | 'dirty' | 'diverged' | 'ff-failed' | 'pulled' | 'rebased'
  incoming: number
  outgoing: number
  changedFiles: string[]
  error?: string
}

type HoloGitClonePayload = {
  repoUrl: string
  username?: string
  password?: string
  destinationPath: string
  remember?: boolean
}

type HoloOpenFileInNewWindowPayload = {
  rootPath: string
  filePath: string
}

type HoloImageStorageOptions = {
  mode?: 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'
  azure?: {
    containerUrl: string
    sasToken: string
  }
  s3?: {
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    endpoint?: string
    publicBaseUrl?: string
  }
  dropbox?: {
    accessToken: string
    folderPath?: string
  }
  gdrive?: {
    accessToken: string
    folderId?: string
  }
}

type HoloArchivedFileEntry = {
  archivedPath: string
  originalPath: string
  name: string
}

interface HoloApi {
  appName: string
  getAppVersion: () => Promise<string>
  exportPdf: (payload: { html: string; suggestedName?: string }) => Promise<{ ok: true; filePath: string } | { ok: false; canceled?: boolean; error?: string }>
  openFileInNewWindow: (payload: HoloOpenFileInNewWindowPayload) => Promise<{ ok: true }>
  writeClipboardText: (text: string) => Promise<{ ok: true }>
  checkForUpdates: () => Promise<unknown>
  installUpdate: () => Promise<unknown>
  getUpdateState: () => Promise<unknown>
  onUpdateAvailable: (callback: () => void) => () => void
  onUpdateReady: (callback: () => void) => () => void
  onUpdateProgress: (callback: (data: { percent: number }) => void) => () => void
  getHoloConfig: () => Promise<Record<string, unknown>>
  setHoloConfig: (cfg: Record<string, unknown>) => Promise<{ ok: true }>
  getHoloConfigValue: (key: string) => Promise<unknown>
  setHoloConfigValue: (key: string, value: unknown) => Promise<{ ok: true }>
  factoryReset: () => Promise<{ ok: boolean }>
  minimizeWindow: () => Promise<{ ok: true }>
  getWindowState: () => Promise<{ ok: true; isMaximized: boolean; platform: string }>
  dragWindowFromMaximized: (payload: { pointerScreenX: number; pointerScreenY: number; pointerOffsetRatioX: number; headerHeight: number }) => Promise<{ ok: boolean; isMaximized: boolean }>
  setWindowPosition: (payload: { x: number; y: number }) => Promise<{ ok: true }>
  toggleMaximizeWindow: () => Promise<{ ok: true; isMaximized: boolean }>
  closeWindow: () => Promise<{ ok: true }>
  toggleDevTools: () => Promise<{ ok: true }>
  openExternalUrl: (url: string) => Promise<{ ok: true }>
  /** Ouvre un lien holo:// (ou de la passerelle https) dans l'app. */
  openHoloLink: (url: string) => Promise<{ ok: true }>
  getShareInfo: (filePath: string) => Promise<{ rootPath: string | null; remoteUrl: string | null }>
  /** Avertissements sur l'emplacement d'un espace (dépôt git dans un dossier OneDrive…). */
  getSpaceWarnings: (spacePath: string) => Promise<{ syncedFolderProvider: string | null }>
  /** Édition en temps réel via le relais Codenotch (voir docs/COLLABORATION_TEMPS_REEL.md). */
  realtime: HoloRealtimeApi
  onLaunchPayload: (callback: (payload: HoloLaunchPayload) => void) => () => void
  openFolder: () => Promise<OpenFolderResult>
  getRecentFolders: () => Promise<string[]>
  getRecentFolderIcon: (folderPath: string) => Promise<string | null>
  removeRecentFolder: (folderPath: string) => Promise<string[]>
  showItemInFolder: (folderPath: string) => Promise<{ ok: true }>
  openPath: (targetPath: string) => Promise<{ ok: true }>
  getSearchIndexPath: () => Promise<string>
  readSearchIndex: () => Promise<string | null>
  writeSearchIndex: (content: string) => Promise<{ ok: true }>
  openRecentFolder: (folderPath: string) => Promise<OpenFolderResult>
  refreshTree: () => Promise<OpenFolderResult>
  readFile: (filePath: string) => Promise<string>
  readFileOptional: (filePath: string) => Promise<string | null>
  getPathStats: (targetPath: string) => Promise<{ modifiedAt: string; createdAt: string }>
  writeFile: (filePath: string, content: string) => Promise<{ ok: true }>
  /** Écrit le document ouvert ; fusionne avec le disque s'il a changé depuis `baseContent`. */
  writeDocument: (filePath: string, content: string, baseContent: string | null, expectedDiskContent: string | null) => Promise<{ ok: true; content: string; merged: boolean; conflict: boolean; externalChange: boolean }>
  watchDocument: (filePath: string | null) => Promise<{ ok: true }>
  onDocumentChanged: (callback: (payload: { path: string }) => void) => () => void
  onBeforeClose: (callback: () => void) => () => void
  confirmClose: () => Promise<{ ok: true }>
  createFile: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  createDirectory: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  archivePath: (targetPath: string) => Promise<{ ok: true; archivedPath: string; originalPath: string }>
  listArchivedFiles: () => Promise<HoloArchivedFileEntry[]>
  restoreArchivedPath: (archivedPath: string) => Promise<{ ok: true; archivedPath: string; restoredPath: string }>
  deletePath: (targetPath: string) => Promise<{ ok: true }>
  filterExistingPaths: (paths: string[]) => Promise<string[]>
  scanMdFiles: (folderPath: string) => Promise<string[]>
  registerKnownRoots: (paths: string[]) => Promise<{ ok: boolean }>
  renamePath: (
    targetPath: string,
    newName: string,
  ) => Promise<{ ok: true; newPath: string }>
  movePath: (
    sourcePath: string,
    targetDirectoryPath: string,
  ) => Promise<{ ok: true; newPath: string }>
  copyFile: (
    sourcePath: string,
    targetDirectoryPath: string,
  ) => Promise<{ ok: true; newPath: string }>
  readRepoConfig: () => Promise<Record<string, unknown> | null>
  writeRepoConfig: (config: Record<string, unknown>) => Promise<{ ok: true }>
  readSpaceConfig: (spacePath: string) => Promise<Record<string, unknown> | null>
  writeSpaceConfig: (spacePath: string, config: Record<string, unknown>) => Promise<{ ok: true }>
  gitGetState: (fetchRemote?: boolean) => Promise<HoloGitState>
  gitGetFolderStatuses: (folderPaths: string[]) => Promise<Record<string, 'local' | 'git-sync' | 'git-readonly'>>
  gitGetFileActivity: (filePath: string, maxCount?: number) => Promise<HoloGitFileActivity[]>
  gitGetFileLog: (filePath: string, maxCount?: number) => Promise<HoloGitFileCommit[]>
  gitGetContributors: () => Promise<HoloGitContributor[]>
  gitAutoSave: (filePath: string, authorName?: string, authorEmail?: string) => Promise<{ ok: boolean; committed: boolean; pushed?: boolean; reason?: string; error?: string; pushError?: string }>
  gitPickCloneDirectory: () => Promise<string | null>
  gitCloneRepository: (payload: HoloGitClonePayload) => Promise<OpenFolderResult>
  gitGetSavedCredentials: (repoUrl: string) => Promise<{ username: string; hasPassword: boolean } | null>
  gitFetch: () => Promise<{ ok: true; output: string }>
  gitCommit: (message: string) => Promise<HoloGitCommitResult>
  gitSync: () => Promise<HoloGitSyncResult>
  gitPull: () => Promise<{ ok: true; output: string }>
  gitPullIfSafe: () => Promise<HoloGitPullIfSafeResult>
  gitMerge: (branch: string) => Promise<{ ok: true; output: string }>
  gitResolveConflict: (filePath: string, strategy: 'ours' | 'theirs' | 'both' | 'manual') => Promise<{ ok: true; filePath: string; strategy: 'ours' | 'theirs' | 'both' | 'manual'; operation: 'rebase' | 'merge' | 'none'; completed: boolean; stillConflicted: boolean; conflictedFiles: string[]; content: string | null; pushed: boolean; pushError: string | null }>
  saveImage: (name: string, dataBase64: string, options?: HoloImageStorageOptions) => Promise<{ ok: true; relativePath: string; absolutePath: string }>
  loadImage: (relativePath: string) => Promise<{ok: true; dataUrl: string}>
  /** Copie une image (chemin du document, URL http(s) ou data:) dans le presse-papiers système. */
  writeClipboardImage: (source: string) => Promise<{ ok: true }>
  /** Source de l'image si le presse-papiers contient encore l'image copiée depuis Holo. */
  getCopiedHoloImage: () => Promise<string | null>
  showImageInFolder: (source: string) => Promise<{ ok: true }>
}

declare global {
  type HoloRealtimeConfig = { url: string; enabled: boolean; hasToken: boolean }
  type HoloRealtimeDocument =
    | { available: true; documentId: string; key: string; workspace: string; path: string }
    | { available: false; reason: 'disabled' | 'no-space' | 'no-remote' | 'no-history' }
  type HoloRealtimeState = { state: string | null; version: number; epoch: string | null; updates: { id: string; update: string }[] }
  type HoloRealtimeEvent =
    | { documentId: string; type: 'ready'; data: unknown }
    | { documentId: string; type: 'update'; data: { u: string; c: string; i: string } }
    | { documentId: string; type: 'awareness'; data: { a: string; c: string } }
    | { documentId: string; type: 'status'; data: { state: 'connected' | 'reconnecting' | 'unauthorized' | 'disabled'; status?: number; error?: string } }
  type HoloRealtimeApi = {
    getConfig: () => Promise<HoloRealtimeConfig>
    setConfig: (config: { url: string; enabled: boolean; token?: string }) => Promise<{ ok: true }>
    testConnection: (candidate?: { url: string; token?: string }) => Promise<{ ok: boolean; status?: number | null; error?: string }>
    resolveDocument: (filePath: string) => Promise<HoloRealtimeDocument>
    subscribe: (documentId: string) => Promise<{ ok: true }>
    unsubscribe: (documentId: string) => Promise<{ ok: true }>
    getState: (documentId: string) => Promise<HoloRealtimeState>
    getUpstreamContent: (filePath: string) => Promise<string | null>
    mergeText: (base: string, ours: string, theirs: string) => Promise<string>
    pushUpdate: (documentId: string, payload: { update: string; clientId: string; workspace?: string; path?: string }) => Promise<{ id: string }>
    pushAwareness: (documentId: string, payload: { awareness: string; clientId: string }) => Promise<{ ok: true }>
    compact: (documentId: string, payload: { state: string; expectedVersion: number; mergedUpdateIds?: string[]; reset?: boolean; workspace?: string; path?: string }) => Promise<{ ok: true; version: number; epoch: string } | { ok: false; conflict: true }>
    onEvent: (callback: (event: HoloRealtimeEvent) => void) => () => void
  }

  /** Lien Holo, fichier ou dossier transmis à l'app (démarrage ou instance déjà ouverte). */
  type HoloLaunchPayload = {
    rootPath: string
    filePath: string
    startupError?: string
    cloneRequest?: { remoteUrl: string; repoName: string; relativeFilePath: string }
  }

  interface Window {
    holo?: HoloApi
  }
}

export {}
