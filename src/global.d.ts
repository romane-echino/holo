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
  branch: string | null
  localChanges: number
  incoming: number
  outgoing: number
  conflictedFiles: string[]
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

type HoloGitClonePayload = {
  repoUrl: string
  username?: string
  password?: string
  destinationPath: string
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
  openFileInNewWindow: (payload: HoloOpenFileInNewWindowPayload) => Promise<{ ok: true }>
  minimizeWindow: () => Promise<{ ok: true }>
  toggleMaximizeWindow: () => Promise<{ ok: true; isMaximized: boolean }>
  closeWindow: () => Promise<{ ok: true }>
  toggleDevTools: () => Promise<{ ok: true }>
  openExternalUrl: (url: string) => Promise<{ ok: true }>
  openFolder: () => Promise<OpenFolderResult>
  getRecentFolders: () => Promise<string[]>
  removeRecentFolder: (folderPath: string) => Promise<string[]>
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
  readRepoConfig: () => Promise<any | null>
  writeRepoConfig: (config: any) => Promise<{ ok: true }>
  gitGetState: (fetchRemote?: boolean) => Promise<HoloGitState>
  gitPickCloneDirectory: () => Promise<string | null>
  gitCloneRepository: (payload: HoloGitClonePayload) => Promise<OpenFolderResult>
  gitFetch: () => Promise<{ ok: true; output: string }>
  gitCommit: (message: string) => Promise<HoloGitCommitResult>
  gitSync: () => Promise<HoloGitSyncResult>
  gitPull: () => Promise<{ ok: true; output: string }>
  gitMerge: (branch: string) => Promise<{ ok: true; output: string }>
  gitResolveConflict: (filePath: string, strategy: 'ours' | 'theirs') => Promise<{ ok: true; filePath: string; strategy: 'ours' | 'theirs' }>
  saveImage: (name: string, dataBase64: string, options?: HoloImageStorageOptions) => Promise<{ ok: true; relativePath: string; absolutePath: string }>
  loadImage: (relativePath: string) => Promise<{ok: true; dataUrl: string}>
}

declare global {
  interface Window {
    holo?: HoloApi
  }
}

export {}
