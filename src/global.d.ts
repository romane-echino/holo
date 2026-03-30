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

interface HoloApi {
  appName: string
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
  getPathStats: (targetPath: string) => Promise<{ modifiedAt: string; createdAt: string }>
  writeFile: (filePath: string, content: string) => Promise<{ ok: true }>
  createFile: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  createDirectory: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  deletePath: (targetPath: string) => Promise<{ ok: true }>
  renamePath: (
    targetPath: string,
    newName: string,
  ) => Promise<{ ok: true; newPath: string }>
  movePath: (
    sourcePath: string,
    targetDirectoryPath: string,
  ) => Promise<{ ok: true; newPath: string }>
  gitGetState: (fetchRemote?: boolean) => Promise<HoloGitState>
  gitFetch: () => Promise<{ ok: true; output: string }>
  gitCommit: (message: string) => Promise<HoloGitCommitResult>
  gitSync: () => Promise<HoloGitSyncResult>
  gitPull: () => Promise<{ ok: true; output: string }>
  gitMerge: (branch: string) => Promise<{ ok: true; output: string }>
  saveImage: (name: string, dataBase64: string) => Promise<{ ok: true; relativePath: string; absolutePath: string }>
  loadImage: (relativePath: string) => Promise<{ok: true; dataUrl: string}>
}

declare global {
  interface Window {
    holo?: HoloApi
  }
}

export {}
