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
  openFolder: () => Promise<OpenFolderResult>
  refreshTree: () => Promise<OpenFolderResult>
  readFile: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<{ ok: true }>
  createFile: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  createDirectory: (parentDirectoryPath: string, name: string) => Promise<{ ok: true }>
  deletePath: (targetPath: string) => Promise<{ ok: true }>
  renamePath: (
    targetPath: string,
    newName: string,
  ) => Promise<{ ok: true; newPath: string }>
  gitGetState: (fetchRemote?: boolean) => Promise<HoloGitState>
  gitFetch: () => Promise<{ ok: true; output: string }>
  gitCommit: (message: string) => Promise<HoloGitCommitResult>
  gitSync: () => Promise<HoloGitSyncResult>
  gitPull: () => Promise<{ ok: true; output: string }>
  gitMerge: (branch: string) => Promise<{ ok: true; output: string }>
}

declare global {
  interface Window {
    holo?: HoloApi
  }
}

export {}
