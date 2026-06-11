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
  reason: 'no-root' | 'not-a-repo' | 'no-remote' | 'fetch-failed' | 'up-to-date' | 'dirty' | 'diverged' | 'ff-failed' | 'pulled'
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
  getClipboardFormats: () => Promise<string[]>
  clipboardHasFormat: (format: string) => Promise<boolean>
  readClipboardFormat: (format: string) => Promise<string>
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
  gitAutoSave: (filePath: string, authorName?: string, authorEmail?: string) => Promise<{ ok: boolean; committed: boolean; reason?: string; error?: string }>
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
}

declare global {
  interface Window {
    holo?: HoloApi
  }
}

export {}
