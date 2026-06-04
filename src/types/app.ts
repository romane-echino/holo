export type NodeType = 'file' | 'directory'

export type TreeNode = {
  name: string
  path: string
  type: NodeType
  archivedOriginalPath?: string
  children?: TreeNode[]
}

export type OpenFolderResult = {
  rootPath: string
  tree: TreeNode
} | null

export type FileMeta = {
  title: string
  description: string
  isTemplate: boolean
  tags?: string[]
  icon?: string
}

export type SearchIndexEntry = {
  path: string
  spaceRoot: string
  name: string
  title: string
  description: string
  tags: string[]
  headings: string[]
  content: string
  linkedPaths: string[]
  mtime: string
}

export type SearchResultItem = {
  path: string
  name: string
  excerpt: string
  matchType: 'content' | 'tag' | 'archive'
  tags?: string[]
  isArchived?: boolean
  archivedPath?: string
  originalPath?: string
}